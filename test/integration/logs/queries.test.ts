import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveLogServers, type LogScope } from '../../../server/utils/logs/apiHelpers'
import { runIngest } from '../../../server/utils/logs/ingest/queue'
import { closeLogDb } from '../../../server/utils/logs/logDb'
import { botsOverview } from '../../../server/utils/logs/queries/bots'
import { explorerRows } from '../../../server/utils/logs/queries/explorer'
import { httpErrorTop, phpErrorGroups } from '../../../server/utils/logs/queries/errors'
import { perfEndpoints, perfPercentiles } from '../../../server/utils/logs/queries/perf'
import { buildBlockRules, securityThreats } from '../../../server/utils/logs/queries/security'
import { correlationTimeline } from '../../../server/utils/logs/queries/timeline'
import {
  trafficOverview,
  trafficStatusCodes,
  trafficTimeseries,
  trafficTop,
} from '../../../server/utils/logs/queries/traffic'
import { visitorCountries } from '../../../server/utils/logs/queries/visitors'

// Opening a DuckDB instance (native load, schema migration) before the first assertion can
// take several seconds on its own, and vitest runs these files in parallel with each other.
// The default 5s budget is for quick unit tests, not for standing up an analytical database.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const SERVER_DIR = ['acme', 'live', '10.0.0.1']
const DAY = '15/Jul/2026'

let scope: LogScope

function accessLine(opts: {
  path: string
  status: number
  clientIp: string
  duration: number
  minute: number
  ua?: string
}): string {
  const ua =
    opts.ua ??
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const ts = `${DAY}:12:${String(opts.minute).padStart(2, '0')}:00 +0000`
  return `10.1.0.9 - - [${ts}]  "GET ${opts.path} HTTP/1.1" ${opts.status} 512 "-" "${ua}" ${opts.duration} "${opts.clientIp}, 10.1.0.9"`
}

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'uptime-checker-test-ingress-'))
  const dir = join(root, ...SERVER_DIR)
  mkdirSync(dir, { recursive: true })

  const lines: string[] = []
  // A spread of ordinary traffic, plus one slow endpoint and one 404-scanning address.
  for (let i = 0; i < 20; i++) {
    lines.push(accessLine({ path: '/', status: 200, clientIp: '203.0.113.1', duration: 0.1, minute: i }))
  }
  for (let i = 0; i < 10; i++) {
    lines.push(accessLine({ path: '/slow', status: 200, clientIp: '203.0.113.2', duration: 2.5, minute: i }))
  }
  for (let i = 0; i < 6; i++) {
    lines.push(accessLine({ path: '/api/thing', status: 500, clientIp: '203.0.113.3', duration: 0.3, minute: i }))
  }
  // 12 distinct missing paths from one IP: over the >= 10 threshold the offender query uses.
  for (let i = 0; i < 12; i++) {
    lines.push(accessLine({ path: `/wp-login-${i}.php`, status: 404, clientIp: '198.51.100.7', duration: 0.01, minute: i }))
  }
  lines.push(
    accessLine({
      path: '/',
      status: 200,
      clientIp: '203.0.113.9',
      duration: 0.2,
      minute: 30,
      ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    }),
  )
  writeFileSync(join(dir, 'nginx-access.log'), lines.join('\n') + '\n')

  writeFileSync(
    join(dir, 'php-error.log'),
    `[15-Jul-2026 12:05:00 UTC] PHP Fatal error:  Uncaught Error: Call to undefined function boom() in /var/www/app.php:42\nStack trace:\n#0 {main}\n  thrown in /var/www/app.php on line 42\n`,
  )

  await runIngest([root])

  const { serverIds } = await resolveLogServers('acme')
  scope = {
    serverIds,
    from: new Date('2026-07-15T00:00:00Z'),
    to: new Date('2026-07-16T00:00:00Z'),
  }
  expect(scope.serverIds.length).toBe(1)
})

afterAll(async () => {
  await closeLogDb()
})

describe('traffic queries', () => {
  it('summarises requests, errors and visitors', async () => {
    const overview = await trafficOverview(scope)
    expect(overview.requests).toBe(49)
    expect(overview.count_5xx).toBe(6)
    expect(overview.count_4xx).toBe(12)
    expect(overview.bot_requests).toBe(1)
  })

  it('buckets a timeseries and splits it by status class', async () => {
    const result = await trafficTimeseries(scope, {
      metric: 'requests',
      interval: '1h',
      groupBy: 'status_class',
    })
    expect(result.interval).toBe('1 hour')

    const series = new Set(result.series.map((row) => row.series))
    expect(series).toEqual(new Set(['2xx', '4xx', '5xx']))
  })

  it('rejects a metric that is not whitelisted', async () => {
    await expect(
      trafficTimeseries(scope, { metric: 'count(*) FROM sites --', interval: 'auto', groupBy: 'none' }),
    ).rejects.toThrow(/Invalid metric/)
  })

  it('falls back to an auto interval for an unknown interval token', async () => {
    const result = await trafficTimeseries(scope, { metric: 'requests', interval: 'auto', groupBy: 'none' })
    expect(Object.keys(result)).toContain('interval')
  })

  it('counts status codes', async () => {
    const rows = await trafficStatusCodes(scope)
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.count]))
    expect(byStatus[200]).toBe(31)
    expect(byStatus[404]).toBe(12)
    expect(byStatus[500]).toBe(6)
  })

  it('ranks top paths and rejects an unknown dimension', async () => {
    const rows = await trafficTop(scope, { dim: 'path', limit: 5 })
    expect(rows[0]).toMatchObject({ value: '/', requests: 21 })

    await expect(trafficTop(scope, { dim: 'sql_text', limit: 5 })).rejects.toThrow(/Invalid dim/)
  })
})

describe('performance queries', () => {
  it('computes percentiles', async () => {
    const { overview } = await perfPercentiles(scope)
    expect(Number(overview.count)).toBe(49)
    expect(Number(overview.max)).toBeCloseTo(2.5, 5)
  })

  it('ranks the slowest endpoints by p95', async () => {
    const rows = await perfEndpoints(scope, { limit: 10, sort: 'p95' })
    expect(rows[0]!.path_pattern).toBe('/slow')
  })
})

describe('error queries', () => {
  it('lists the worst failing endpoints for a status class', async () => {
    const rows = await httpErrorTop(scope, '5xx')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 500, count: 6 })
  })

  it('groups PHP errors by fingerprint', async () => {
    const groups = await phpErrorGroups(scope)
    expect(groups).toHaveLength(1)
    expect(String(groups[0]!.error_type)).toMatch(/Fatal/)
  })
})

describe('security queries', () => {
  it('flags scanner paths and 404 offenders', async () => {
    const threats = await securityThreats(scope)
    expect(threats.suspiciousPaths.length).toBeGreaterThan(0)

    const offender = threats.offenderIps.find((row) => row.client_ip === '198.51.100.7')
    expect(offender).toBeDefined()
    expect(Number(offender!.not_found_count)).toBe(12)
  })

  it('builds nginx deny rules only from valid addresses', () => {
    const rules = buildBlockRules('198.51.100.7, not-an-ip, 203.0.113.9')
    expect(rules.ips).toEqual(['198.51.100.7', '203.0.113.9'])
    expect(rules.nginxDeny).toContain('deny 198.51.100.7;')

    expect(() => buildBlockRules('nonsense')).toThrow()
  })
})

describe('bots and correlation', () => {
  it('separates bot traffic from human traffic', async () => {
    const { summary, topBots } = await botsOverview(scope)
    expect(Number(summary.bot_requests)).toBe(1)
    expect(Number(summary.human_requests)).toBe(48)
    expect(topBots.length).toBeGreaterThan(0)
  })

  it('overlays several log sources on one timeline', async () => {
    const { series } = await correlationTimeline(scope)
    const names = new Set(series.map((row) => row.series))
    expect(names.has('5xx')).toBe(true)
    expect(names.has('php_errors')).toBe(true)
  })
})

describe('visitors and explorer', () => {
  it('returns country rows without failing on unresolved IPs', async () => {
    await expect(visitorCountries(scope)).resolves.toBeInstanceOf(Array)
  })

  it('pages raw rows with a cursor', async () => {
    const first = await explorerRows(scope, 'access_log', { limit: 10 })
    expect(first.rows).toHaveLength(10)
    expect(first.nextCursor).toBeTruthy()

    const second = await explorerRows(scope, 'access_log', { limit: 10, cursor: first.nextCursor! })
    expect(second.rows.length).toBeGreaterThan(0)
    // The cursor is exclusive, so the pages must not overlap.
    expect(second.rows[0]!.ts).not.toEqual(first.rows[0]!.ts)
  })

  it('filters by client IP', async () => {
    const result = await explorerRows(scope, 'access_log', { limit: 50, clientIp: '198.51.100.7' })
    expect(result.rows).toHaveLength(12)
  })

  it('refuses a table that is not whitelisted', async () => {
    await expect(explorerRows(scope, 'sites', { limit: 10 })).rejects.toThrow(/Unknown explorer table/)
  })
})
