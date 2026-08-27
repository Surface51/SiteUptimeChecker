import { gzipSync } from 'node:zlib'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ingestEvents, requestIngestStop, runIngest } from '../../../server/utils/logs/ingest/queue'
import { closeLogDb, queryLogs } from '../../../server/utils/logs/logDb'
import { getDb, setLogFolderPaused } from '../../../server/utils/db'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

let root: string

// A low flush threshold so a checkpoint (and hence a stoppable boundary) lands after a
// couple dozen rows rather than 5000 — see queue.ts.
beforeEach(async () => {
  process.env.UPTIME_LOG_INGEST_BATCH = '25'
  await closeLogDb()
  rmSync(join(process.env.UPTIME_DATA_DIR!, 'logs.duckdb'), { force: true })
  rmSync(join(process.env.UPTIME_DATA_DIR!, 'logs.duckdb.wal'), { force: true })
  getDb().exec('DELETE FROM log_folder_settings')
  root = mkdtempSync(join(tmpdir(), 'uptime-ingest-stop-'))
})

afterEach(() => {
  delete process.env.UPTIME_LOG_INGEST_BATCH
})

afterAll(async () => {
  await closeLogDb()
})

function serverDir(site: string, ip = '10.0.0.1') {
  const dir = join(root, site, 'live', ip)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** A line in the strict nginx access format this parser expects. */
function accessLine(i: number): string {
  const day = String((i % 27) + 1).padStart(2, '0')
  const ua = `Mozilla/5.0 padding-${'x'.repeat(80)}`
  return `10.1.0.9 - - [${day}/Jul/2026:12:00:00 +0000]  "GET /p/${i} HTTP/1.1" 200 512 "-" "${ua}" 0.10 "203.0.113.${(i % 250) + 1}, 10.1.0.9"`
}

/** A multi-line PHP error record: header + two stack frames. */
function phpErrorRecord(i: number): string {
  const day = String((i % 27) + 1).padStart(2, '0')
  return [
    `[${day}-Aug-2026 08:51:03 UTC] PHP Warning:  Undefined variable $v${i} in /var/www/app${i % 4}.php on line ${i}`,
    `#0 /var/www/app${i % 4}.php(${i}): handler()`,
    `#1 {main}`,
  ].join('\n')
}

/** Runs an ingest, asking it to stop the first time a checkpoint reports progress on a file. */
async function runAndStopEarly(): Promise<void> {
  let asked = false
  const onProgress = (s: { running: boolean; currentFileBytesDone: number }) => {
    if (!asked && s.running && s.currentFileBytesDone > 0) {
      asked = true
      requestIngestStop()
    }
  }
  ingestEvents.on('progress', onProgress)
  try {
    await runIngest([root])
  } finally {
    ingestEvents.off('progress', onProgress)
  }
}

async function fileRow(like: string) {
  const rows = (await queryLogs(
    `SELECT byte_offset, lines_ingested, size, status FROM ingest_files WHERE path LIKE '%${like}'`,
  )) as { byte_offset: number; lines_ingested: number; size: number; status: string }[]
  const r = rows[0]!
  return {
    byteOffset: Number(r.byte_offset),
    linesIngested: Number(r.lines_ingested),
    size: Number(r.size),
    status: String(r.status),
  }
}

async function count(table: string): Promise<number> {
  const rows = (await queryLogs(`SELECT count(*) AS n FROM ${table}`)) as { n: number }[]
  return Number(rows[0]!.n)
}

describe('stoppable ingest', () => {
  it('resumes a stateless-parser file with no duplicated or lost rows', async () => {
    const dir = serverDir('acme')
    const lines = Array.from({ length: 400 }, (_, i) => accessLine(i))
    writeFileSync(join(dir, 'nginx-access.log'), lines.join('\n') + '\n')

    await runAndStopEarly()

    const stopped = await fileRow('nginx-access.log')
    expect(stopped.status).toBe('stopped')
    expect(stopped.byteOffset).toBeGreaterThan(0)
    expect(stopped.byteOffset).toBeLessThan(stopped.size)
    const partial = await count('access_log')
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(400)

    // Resume.
    await runIngest([root])

    expect(await count('access_log')).toBe(400)
    const done = await fileRow('nginx-access.log')
    expect(done.status).toBe('done')
    expect(done.byteOffset).toBe(done.size)

    // Every path present exactly once — no dupes across the seam, no gap at it.
    const distinct = (await queryLogs(`SELECT count(DISTINCT path) AS n FROM access_log`)) as { n: number }[]
    expect(Number(distinct[0]!.n)).toBe(400)
  })

  it('resumes a multi-line-record parser without tearing the record at the seam', async () => {
    const dir = serverDir('acme')
    const records = Array.from({ length: 150 }, (_, i) => phpErrorRecord(i))
    writeFileSync(join(dir, 'php-error.log'), records.join('\n') + '\n')

    await runAndStopEarly()
    expect((await fileRow('php-error.log')).status).toBe('stopped')
    const partial = await count('php_error')
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(150)

    await runIngest([root])

    // Exactly one row per record, and every stack captured (a torn record loses its frames).
    expect(await count('php_error')).toBe(150)
    const bad = (await queryLogs(
      `SELECT count(*) AS n FROM php_error WHERE stack NOT LIKE '%{main}%'`,
    )) as { n: number }[]
    expect(Number(bad[0]!.n)).toBe(0)
  })

  it('restarts a compressed file from scratch when stopped mid-stream', async () => {
    const dir = serverDir('acme')
    const lines = Array.from({ length: 400 }, (_, i) => accessLine(i))
    writeFileSync(join(dir, 'nginx-access.log-20260701.gz'), gzipSync(Buffer.from(lines.join('\n') + '\n')))

    await runAndStopEarly()
    expect((await fileRow('nginx-access.log-20260701.gz')).status).toBe('stopped')

    await runIngest([root])

    // planFile wiped the partial rows and redid the file — exactly 400, not 400 + partial.
    expect(await count('access_log')).toBe(400)
  })

  it('produces the same rows as an uninterrupted run', async () => {
    const dir = serverDir('acme')
    const lines = Array.from({ length: 400 }, (_, i) => accessLine(i))
    writeFileSync(join(dir, 'nginx-access.log'), lines.join('\n') + '\n')

    await runAndStopEarly()
    await runIngest([root])
    const interrupted = await count('access_log')

    // Fresh store, same input, one clean run.
    await closeLogDb()
    rmSync(join(process.env.UPTIME_DATA_DIR!, 'logs.duckdb'), { force: true })
    rmSync(join(process.env.UPTIME_DATA_DIR!, 'logs.duckdb.wal'), { force: true })
    await runIngest([root])

    expect(await count('access_log')).toBe(interrupted)
  })
})

describe('paused folders', () => {
  it('are skipped by runIngest and excluded from filesTotal', async () => {
    writeFileSync(join(serverDir('acme'), 'nginx-access.log'), accessLine(1) + '\n')
    writeFileSync(join(serverDir('beta'), 'nginx-access.log'), accessLine(2) + '\n')

    setLogFolderPaused('beta', true)
    const status = await runIngest([root])
    expect(status.filesTotal).toBe(1)

    const sites = (await queryLogs(`SELECT name FROM sites ORDER BY name`)) as { name: string }[]
    expect(sites.map((s) => s.name)).toEqual(['acme'])

    setLogFolderPaused('beta', false)
    await runIngest([root])
    const after = (await queryLogs(`SELECT name FROM sites ORDER BY name`)) as { name: string }[]
    expect(after.map((s) => s.name)).toEqual(['acme', 'beta'])
  })
})
