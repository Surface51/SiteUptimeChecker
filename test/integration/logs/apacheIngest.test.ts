import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runIngest } from '../../../server/utils/logs/ingest/queue'
import { closeLogDb, queryLogs } from '../../../server/utils/logs/logDb'

// Apache logs flow through the same discovery → registry → appender path as the nginx ones and
// land in the same tables (access_log, nginx_error_agg). This proves an end-to-end run of a
// hand-written Apache tree parses cleanly rather than piling up parse_errors.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const SERVER_DIR = ['apache-demo', 'live', 'web01.example.com'] // a hostname, not an IP

let root: string

function accessLine(i: number): string {
  const day = String((i % 27) + 1).padStart(2, '0')
  const status = i % 9 === 0 ? 500 : 200
  return (
    `203.0.113.${(i % 250) + 1} - - [${day}/Jul/2026:12:00:00 +0000] ` +
    `"GET /p/${i}?x=1 HTTP/1.1" ${status} 512 "https://ref.example" ` +
    `"Mozilla/5.0 (X11; Linux x86_64) Chrome/145.0.0.0" 1500`
  )
}

function errorLine(minute: number): string {
  const mm = String(minute % 60).padStart(2, '0')
  return `[Wed Jul 01 10:${mm}:00.123456 2026] [proxy_fcgi:error] [pid 1:tid 2] [client 203.0.113.5:41234] AH01071: Got error 'Primary script unknown'`
}

beforeEach(async () => {
  await closeLogDb()
  rmSync(join(process.env.UPTIME_DATA_DIR!, 'logs.duckdb'), { force: true })
  root = mkdtempSync(join(tmpdir(), 'uptime-apache-ingress-'))
  mkdirSync(join(root, ...SERVER_DIR), { recursive: true })
})

afterAll(async () => {
  await closeLogDb()
})

describe('runIngest — Apache logs', () => {
  it('parses apache-access.log into access_log with no parse errors', async () => {
    writeFileSync(
      join(root, ...SERVER_DIR, 'apache-access.log'),
      Array.from({ length: 200 }, (_, i) => accessLine(i)).join('\n') + '\n',
    )

    const status = await runIngest([root])
    expect(status.filesTotal).toBe(1)
    expect(status.errors).toEqual([])

    const [counts] = (await queryLogs(
      `SELECT count(*) AS n, sum(CASE WHEN status = 500 THEN 1 ELSE 0 END) AS n500 FROM access_log`,
    )) as { n: number; n500: number }[]
    expect(Number(counts!.n)).toBe(200)
    expect(Number(counts!.n500)).toBeGreaterThan(0)

    const [file] = (await queryLogs(
      `SELECT status, parse_errors FROM ingest_files WHERE path LIKE '%apache-access.log'`,
    )) as { status: string; parse_errors: number }[]
    expect(file!.status).toBe('done')
    expect(Number(file!.parse_errors)).toBe(0)

    const [row] = (await queryLogs(
      `SELECT method, path, has_query, duration FROM access_log ORDER BY ts LIMIT 1`,
    )) as { method: string; path: string; has_query: boolean; duration: number }[]
    expect(row!.method).toBe('GET')
    expect(row!.path).toBe('/p/0')
    expect(row!.has_query).toBe(true)
    expect(row!.duration).toBeCloseTo(0.0015) // 1500 µs read as %D
  })

  it('aggregates apache-error.log into nginx_error_agg per minute/fingerprint', async () => {
    // 5 minutes × 20 identical lines each → 5 aggregated rows, count 20 apiece.
    const lines: string[] = []
    for (let m = 0; m < 5; m++) for (let k = 0; k < 20; k++) lines.push(errorLine(m))
    writeFileSync(join(root, ...SERVER_DIR, 'apache-error.log'), lines.join('\n') + '\n')

    const status = await runIngest([root])
    expect(status.errors).toEqual([])

    const rows = (await queryLogs(
      `SELECT count(*) AS groups, sum(count) AS total, min(count) AS lo, max(count) AS hi FROM nginx_error_agg`,
    )) as { groups: number; total: number; lo: number; hi: number }[]
    expect(Number(rows[0]!.groups)).toBe(5)
    expect(Number(rows[0]!.total)).toBe(100)
    expect(Number(rows[0]!.lo)).toBe(20)
    expect(Number(rows[0]!.hi)).toBe(20)

    const [grp] = (await queryLogs(
      `SELECT level, fingerprint FROM nginx_error_agg LIMIT 1`,
    )) as { level: string; fingerprint: string }[]
    expect(grp!.level).toBe('error')
    expect(grp!.fingerprint).toContain('[proxy_fcgi]')
  })
})
