import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveLogServers, type LogScope } from '../../../server/utils/logs/apiHelpers'
import { runIngest } from '../../../server/utils/logs/ingest/queue'
import { closeLogDb } from '../../../server/utils/logs/logDb'
import { incidentContext } from '../../../server/utils/logs/queries/incidentContext'

// Opening a DuckDB instance (native load, schema migration) before the first assertion can
// take several seconds on its own, and vitest runs these files in parallel with each other.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const SERVER_DIR = ['outage', 'live', '10.0.0.9']

// The synthetic outage: healthy either side, a burst of 500s in the middle.
const OUTAGE_START = new Date('2026-07-15T12:20:00Z')
const OUTAGE_END = new Date('2026-07-15T12:30:00Z')

function accessLine(minute: number, status: number, path: string): string {
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  const ts = `15/Jul/2026:12:${String(minute).padStart(2, '0')}:00 +0000`
  return `10.1.0.9 - - [${ts}]  "GET ${path} HTTP/1.1" ${status} 512 "-" "${ua}" 0.20 "203.0.113.4, 10.1.0.9"`
}

let serverIds: number[]

/** The window the endpoint builds: the incident padded by 15 minutes either side. */
function windowScope(padMinutes = 15): LogScope {
  return {
    serverIds,
    from: new Date(OUTAGE_START.getTime() - padMinutes * 60_000),
    to: new Date(OUTAGE_END.getTime() + padMinutes * 60_000),
  }
}

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'uptime-checker-test-incident-'))
  const dir = join(root, ...SERVER_DIR)
  mkdirSync(dir, { recursive: true })

  const lines: string[] = []
  // Healthy traffic across the hour.
  for (let minute = 0; minute < 60; minute++) {
    lines.push(accessLine(minute, 200, '/'))
  }
  // The outage itself: 500s on one endpoint, only between 12:20 and 12:29.
  for (let minute = 20; minute < 30; minute++) {
    for (let i = 0; i < 4; i++) lines.push(accessLine(minute, 500, '/checkout'))
  }
  writeFileSync(join(dir, 'nginx-access.log'), lines.join('\n') + '\n')

  writeFileSync(
    join(dir, 'php-error.log'),
    `[15-Jul-2026 12:22:00 UTC] PHP Fatal error:  Uncaught PDOException: connection refused in /var/www/db.php:11\nStack trace:\n#0 {main}\n  thrown in /var/www/db.php on line 11\n`,
  )

  await runIngest([root])
  serverIds = (await resolveLogServers('outage')).serverIds
  expect(serverIds).toHaveLength(1)
})

afterAll(async () => {
  await closeLogDb()
})

describe('incidentContext', () => {
  it('buckets requests by the minute and separates 5xx from the rest', async () => {
    const context = await incidentContext(windowScope())

    const fivexx = context.requests.filter((row) => row.series === '5xx')
    // One bucket per outage minute, four failures in each.
    expect(fivexx).toHaveLength(10)
    expect(fivexx.every((row) => Number(row.value) === 4)).toBe(true)

    // Minute buckets, not the hourly bucket the other timeseries endpoints would pick.
    expect(context.requests.filter((row) => row.series === 'other').length).toBeGreaterThan(10)
  })

  it('names the endpoint that was failing', async () => {
    const context = await incidentContext(windowScope())

    expect(context.topPaths).toHaveLength(1)
    expect(context.topPaths[0]).toMatchObject({ path_pattern: '/checkout', status: 500, count: 40 })
  })

  it('surfaces PHP errors logged during the window', async () => {
    const context = await incidentContext(windowScope())

    expect(context.phpErrors).toHaveLength(1)
    expect(String(context.phpErrors[0]!.sample_message)).toContain('connection refused')
  })

  it('excludes activity outside the padded window', async () => {
    // A window ending before the outage begins must not pick up any of its failures.
    const before: LogScope = {
      serverIds,
      from: new Date('2026-07-15T12:00:00Z'),
      to: new Date('2026-07-15T12:10:00Z'),
    }
    const context = await incidentContext(before)

    expect(context.topPaths).toHaveLength(0)
    expect(context.phpErrors).toHaveLength(0)
    expect(context.requests.every((row) => row.series === 'other')).toBe(true)
  })
})
