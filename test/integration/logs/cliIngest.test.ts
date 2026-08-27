import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DuckDBInstance } from '@duckdb/node-api'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { runIngest } from '../../../server/utils/logs/ingest/queue'
import { closeLogDb, queryLogs } from '../../../server/utils/logs/logDb'

// Builds the CLI bundle once and runs it against a throwaway data dir, then compares the
// result table-for-table with a serial runIngest() of the same fixture tree. The parallel
// merge path must be exactly equivalent — no duplicated or lost rows.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const REPO = join(__dirname, '../../..')
const TABLES = ['access_log', 'nginx_error_agg', 'php_error', 'fpm_events', 'php_slow', 'mysql_slow', 'db_events']

function accessLine(i: number): string {
  const day = String((i % 27) + 1).padStart(2, '0')
  const ua = `Mozilla/5.0 padding-${'x'.repeat(60)}`
  return `10.1.0.9 - - [${day}/Jul/2026:12:00:00 +0000]  "GET /p/${i} HTTP/1.1" 200 512 "-" "${ua}" 0.10 "203.0.113.${(i % 250) + 1}, 10.1.0.9"`
}
function phpErrorRecord(i: number): string {
  const day = String((i % 27) + 1).padStart(2, '0')
  return [
    `[${day}-Aug-2026 08:51:03 UTC] PHP Warning:  Undefined variable $v${i} in /var/www/a${i % 3}.php on line ${i}`,
    `#0 /var/www/a${i % 3}.php(${i}): h()`,
    `#1 {main}`,
  ].join('\n')
}

function buildTree(root: string) {
  for (const site of ['alpha', 'beta']) {
    const dir = join(root, site, 'live', '10.0.0.1')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'nginx-access.log'), Array.from({ length: 900 }, (_, i) => accessLine(i)).join('\n') + '\n')
    writeFileSync(
      join(dir, 'nginx-access.log-20260701.gz'),
      gzipSync(Buffer.from(Array.from({ length: 700 }, (_, i) => accessLine(i + 5000)).join('\n') + '\n')),
    )
    writeFileSync(join(dir, 'php-error.log'), Array.from({ length: 120 }, (_, i) => phpErrorRecord(i)).join('\n') + '\n')
  }
}

async function countsFromDb(dbPath: string): Promise<Record<string, number>> {
  const conn = await (await DuckDBInstance.create(dbPath)).connect()
  const out: Record<string, number> = {}
  for (const t of TABLES) {
    const reader = await conn.runAndReadAll(`SELECT count(*) AS n FROM ${t}`)
    out[t] = Number((reader.getRowObjectsJS()[0] as { n: number }).n)
  }
  conn.closeSync()
  return out
}

let ingressRoot: string

beforeAll(() => {
  execFileSync('node', ['scripts/logs-ingest/build.mjs'], { cwd: REPO, stdio: 'ignore' })
  ingressRoot = mkdtempSync(join(tmpdir(), 'uptime-cli-ingress-'))
  buildTree(ingressRoot)
})

afterAll(async () => {
  await closeLogDb()
})

describe('logs:ingest CLI', () => {
  it('produces exactly the same rows as a serial runIngest()', async () => {
    // Serial baseline, in this worker's own (setup.ts) data dir.
    await closeLogDb()
    rmSync(join(process.env.UPTIME_DATA_DIR!, 'logs.duckdb'), { force: true })
    rmSync(join(process.env.UPTIME_DATA_DIR!, 'logs.duckdb.wal'), { force: true })
    const serial = await runIngest([ingressRoot])
    expect(serial.errors).toEqual([])
    const serialCounts: Record<string, number> = {}
    for (const t of TABLES) {
      const rows = (await queryLogs(`SELECT count(*) AS n FROM ${t}`)) as { n: number }[]
      serialCounts[t] = Number(rows[0]!.n)
    }
    await closeLogDb()

    // Parallel run into a fresh data dir via the built CLI.
    const cliDataDir = mkdtempSync(join(tmpdir(), 'uptime-cli-data-'))
    execFileSync('node', ['.output/logs-ingest/cli.js', '--no-server', '--no-progress', '--jobs', '2'], {
      cwd: REPO,
      stdio: 'ignore',
      env: { ...process.env, UPTIME_DATA_DIR: cliDataDir, UPTIME_LOG_INGRESS_DIR: ingressRoot },
    })

    const cliCounts = await countsFromDb(join(cliDataDir, 'logs.duckdb'))

    expect(cliCounts).toEqual(serialCounts)
    expect(cliCounts.access_log).toBe(2 * (900 + 700))
    expect(cliCounts.php_error).toBe(2 * 120)
  })
})
