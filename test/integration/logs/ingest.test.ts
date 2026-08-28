import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runIngest } from '../../../server/utils/logs/ingest/queue'
import { closeLogDb, queryLogs } from '../../../server/utils/logs/logDb'
import { pruneLogRetention } from '../../../server/utils/logs/schedule'

// Opening a DuckDB instance (native load, schema migration) before the first assertion can
// take several seconds on its own, and vitest runs these files in parallel with each other.
// The default 5s budget is for quick unit tests, not for standing up an analytical database.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const SERVER_DIR = ['acme', 'live', '10.0.0.1']

let root: string

/** A line in the nginx access format the parser expects: note the double space after the
 * timestamp and the trailing quoted X-Forwarded-For chain, which is where the real client IP
 * comes from. Padded via the user-agent so a handful of lines exceeds the 1KB head-hash
 * window, which is what makes appends read as "same file, more bytes" rather than rotation. */
function accessLine(opts: { day: number; path: string; status: number; clientIp: string }): string {
  const ua = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 padding-${'x'.repeat(120)}`
  const ts = `${String(opts.day).padStart(2, '0')}/Jul/2026:12:00:00 +0000`
  return `10.1.0.9 - - [${ts}]  "GET ${opts.path} HTTP/1.1" ${opts.status} 512 "-" "${ua}" 0.250 "${opts.clientIp}, 10.1.0.9"`
}

function writeAccessLog(lines: string[]) {
  writeFileSync(join(root, ...SERVER_DIR, 'nginx-access.log'), lines.join('\n') + '\n')
}

/** startDay + count must stay within a real month — an out-of-range day yields a timestamp the
 * parser rejects, which shows up as zero ingested rows rather than an error. */
function seedLines(count: number, startDay = 1): string[] {
  if (startDay + count > 29) throw new Error('seedLines would generate an invalid day of month')
  return Array.from({ length: count }, (_, i) =>
    accessLine({
      day: startDay + i,
      path: `/page-${i}`,
      status: i % 5 === 0 ? 500 : 200,
      clientIp: `203.0.113.${i + 1}`,
    }),
  )
}

async function countAccessRows(): Promise<number> {
  const rows = await queryLogs(`SELECT count(*) AS n FROM access_log`)
  return Number(rows[0]!.n)
}

async function fileState(): Promise<{ byte_offset: number; lines_ingested: number; status: string }> {
  const rows = await queryLogs(
    `SELECT byte_offset, lines_ingested, status FROM ingest_files WHERE path LIKE '%nginx-access.log'`,
  )
  const row = rows[0]!
  return {
    byte_offset: Number(row.byte_offset),
    lines_ingested: Number(row.lines_ingested),
    status: String(row.status),
  }
}

beforeEach(async () => {
  // A fresh DuckDB per test: closeLogDb drops the instance so the next call re-opens against
  // whatever getLogDbPath() resolves to, and the data dir is the per-file temp dir from setup.ts.
  await closeLogDb()
  rmSync(join(process.env.UPTIME_DATA_DIR!, 'logs.duckdb'), { force: true })

  root = mkdtempSync(join(tmpdir(), 'uptime-checker-test-ingress-'))
  mkdirSync(join(root, ...SERVER_DIR), { recursive: true })
})

afterAll(async () => {
  await closeLogDb()
})

describe('runIngest', () => {
  it('discovers and parses access logs under <site>/<env>/<ip>/', async () => {
    writeAccessLog(seedLines(6))

    const status = await runIngest([root])

    expect(status.filesTotal).toBe(1)
    expect(status.errors).toEqual([])
    expect(await countAccessRows()).toBe(6)

    const rows = await queryLogs(
      `SELECT status, client_ip, path FROM access_log ORDER BY ts LIMIT 1`,
    )
    // The client IP is the first X-Forwarded-For hop, not the connecting address.
    expect(rows[0]).toMatchObject({ status: 500, client_ip: '203.0.113.1', path: '/page-0' })
  })

  it('links rows to the site and server directory names', async () => {
    writeAccessLog(seedLines(3))
    await runIngest([root])

    const rows = await queryLogs(
      `SELECT s.name AS site, sv.env, sv.ip, sv.role
       FROM servers sv JOIN sites s ON s.site_id = sv.site_id`,
    )
    expect(rows).toEqual([{ site: 'acme', env: 'live', ip: '10.0.0.1', role: 'app' }])
  })

  it('resumes from the recorded byte offset instead of re-reading the file', async () => {
    writeAccessLog(seedLines(6))
    await runIngest([root])

    const afterFirst = await fileState()
    expect(afterFirst.status).toBe('done')

    appendFileSync(
      join(root, ...SERVER_DIR, 'nginx-access.log'),
      seedLines(2, 20).join('\n') + '\n',
    )
    await runIngest([root])

    // Only the two appended lines are added — the first six are not re-ingested.
    expect(await countAccessRows()).toBe(8)
    const afterSecond = await fileState()
    expect(afterSecond.byte_offset).toBeGreaterThan(afterFirst.byte_offset)
    // lines_ingested accumulates across runs, so this is 6 + 2 rather than the delta alone.
    expect(afterSecond.lines_ingested).toBe(8)
  })

  it('re-ingests from scratch when a live file is rotated out from under it', async () => {
    writeAccessLog(seedLines(6))
    await runIngest([root])
    expect(await countAccessRows()).toBe(6)

    // Replacing the file changes the hash of its first 1KB, which is how rotation is detected.
    writeAccessLog(seedLines(3, 10))
    await runIngest([root])

    // The old rows are dropped rather than the new file being appended to them.
    expect(await countAccessRows()).toBe(3)
  })

  it('skips a file that has not changed since the last run', async () => {
    writeAccessLog(seedLines(4))
    await runIngest([root])

    const status = await runIngest([root])
    expect(status.filesSkipped).toBe(1)
    expect(await countAccessRows()).toBe(4)
  })

  it('settles an empty file to done rather than leaving it pending', async () => {
    writeFileSync(join(root, ...SERVER_DIR, 'nginx-access.log'), '')

    await runIngest([root])

    // Nothing to parse, but the bookkeeping must not sit at 'pending' forever — the /logs
    // status page counts a non-terminal status as an unfinished file.
    const state = await fileState()
    expect(state.status).toBe('done')
    expect(state.byte_offset).toBe(0)

    // A later run leaves it alone, and content added afterwards still ingests.
    writeAccessLog(seedLines(3))
    const status = await runIngest([root])
    expect(status.errors).toEqual([])
    expect(await countAccessRows()).toBe(3)
  })
})

describe('pruneLogRetention', () => {
  it('drops rows past the window but keeps bookkeeping for files still on disk', async () => {
    // Two lines dated 2026, well outside the default 90-day window relative to now.
    writeAccessLog(seedLines(4))
    await runIngest([root])
    const before = await fileState()

    process.env.UPTIME_LOG_RETENTION_DAYS = '1'
    try {
      await pruneLogRetention()
    } finally {
      delete process.env.UPTIME_LOG_RETENTION_DAYS
    }

    expect(await countAccessRows()).toBe(0)

    // The ingest_files row must survive: it is what stops the next run from re-ingesting
    // the very rows that were just pruned.
    const after = await fileState()
    expect(after.byte_offset).toBe(before.byte_offset)

    const status = await runIngest([root])
    expect(status.filesSkipped).toBe(1)
    expect(await countAccessRows()).toBe(0)
  })

  it('forgets bookkeeping for files that have disappeared', async () => {
    writeAccessLog(seedLines(4))
    await runIngest([root])

    rmSync(join(root, ...SERVER_DIR, 'nginx-access.log'))
    await pruneLogRetention()

    const rows = await queryLogs(`SELECT count(*) AS n FROM ingest_files`)
    expect(Number(rows[0]!.n)).toBe(0)
  })
})
