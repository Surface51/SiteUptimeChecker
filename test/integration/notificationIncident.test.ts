import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationRow } from '#shared/types'
import { runIngest } from '../../server/utils/logs/ingest/queue'
import { closeLogDb } from '../../server/utils/logs/logDb'
import { buildNotificationIncident } from '../../server/utils/notificationIncident'
import { resetDb } from '../helpers/db'

// Same posture as the other DuckDB-backed integration tests: opening the instance and running
// the schema migration takes real time, and these files run in parallel with each other.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const SLUG = 'incident-evidence'
const SERVER_DIR = [SLUG, 'live', '10.0.0.7']

/** Access-log line dated `minutesAgo` before now — matches the format server/utils/logs/alerts.ts
 * tests parse against, with `clientIp` as the forwarded client and 10.1.0.9 as the proxy hop. */
function line(opts: { minutesAgo: number; status: number; path: string; clientIp: string }): string {
  const at = new Date(Date.now() - opts.minutesAgo * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const ts =
    `${pad(at.getUTCDate())}/${months[at.getUTCMonth()]}/${at.getUTCFullYear()}:` +
    `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())} +0000`
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  return `10.1.0.9 - - [${ts}]  "GET ${opts.path} HTTP/1.1" ${opts.status} 512 "-" "${ua}" 0.10 "${opts.clientIp}, 10.1.0.9"`
}

async function ingestLines(lines: string[]): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'uptime-checker-test-notif-incident-'))
  const dir = join(root, ...SERVER_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'nginx-access.log'), lines.join('\n') + '\n')
  await runIngest([root])
}

function makeNotification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 1,
    siteId: 1,
    siteName: 'Acme',
    siteUrl: 'https://acme.test/',
    type: 'log_threat_ip',
    message: 'x',
    createdAt: '2026-01-01 00:00:00',
    read: false,
    dismissed: false,
    context: null,
    ...overrides,
  }
}

beforeEach(async () => {
  resetDb()
  await closeLogDb()
})

afterAll(async () => {
  await closeLogDb()
})

describe('buildNotificationIncident', () => {
  it('gathers IP evidence for a threat_ip context', async () => {
    const ip = '198.51.100.9'
    const lines = Array.from({ length: 30 }, () =>
      line({ minutesAgo: 10, status: 404, path: '/wp-login.php', clientIp: ip }),
    )
    await ingestLines(lines)

    const window = {
      from: new Date(Date.now() - 20 * 60_000).toISOString(),
      to: new Date().toISOString(),
    }
    const notification = makeNotification({
      context: { kind: 'threat_ip', logSlug: SLUG, ip, hits: 30, window },
    })

    const result = await buildNotificationIncident(notification, { logSlug: null })
    expect(result.unavailable).toBeNull()
    expect(result.ipEvidence).not.toBeNull()
    expect(result.ipEvidence!.recentRequests.length).toBeGreaterThan(0)
    expect(result.ipEvidence!.requestsPerMinute.length).toBeGreaterThan(0)

    const wpLogin = result.ipEvidence!.topPaths.find((p) => p.path_pattern === '/wp-login.php')
    expect(wpLogin).toBeTruthy()
    expect(wpLogin!.suspicious).toBe(true)
  })

  it('does not flag an ordinary path as suspicious', async () => {
    const ip = '198.51.100.10'
    const lines = Array.from({ length: 15 }, () =>
      line({ minutesAgo: 10, status: 404, path: '/products/widget', clientIp: ip }),
    )
    await ingestLines(lines)

    const window = {
      from: new Date(Date.now() - 20 * 60_000).toISOString(),
      to: new Date().toISOString(),
    }
    const notification = makeNotification({ context: { kind: 'threat_ip', logSlug: SLUG, ip, hits: 15, window } })

    const result = await buildNotificationIncident(notification, { logSlug: null })
    const widget = result.ipEvidence!.topPaths.find((p) => p.path_pattern === '/products/widget')
    expect(widget?.suspicious).toBe(false)
  })

  it('reports unavailable rather than throwing when the log slug has no servers', async () => {
    const notification = makeNotification({
      context: {
        kind: 'threat_ip',
        logSlug: 'no-such-slug',
        ip: '1.2.3.4',
        hits: 5,
        window: { from: '2020-01-01T00:00:00Z', to: '2020-01-01T01:00:00Z' },
      },
    })

    const result = await buildNotificationIncident(notification, { logSlug: null })
    expect(result.ipEvidence).toBeNull()
    expect(result.unavailable).toBeTruthy()
  })

  it('gathers log context for a log_spike context', async () => {
    const lines = Array.from({ length: 25 }, () =>
      line({ minutesAgo: 10, status: 500, path: '/api/thing', clientIp: '203.0.113.5' }),
    )
    await ingestLines(lines)

    const window = {
      from: new Date(Date.now() - 20 * 60_000).toISOString(),
      to: new Date().toISOString(),
    }
    const notification = makeNotification({
      type: 'log_5xx_spike',
      context: { kind: 'log_spike', logSlug: SLUG, metric: '5xx', count: 25, baselinePerHour: 0, window },
    })

    const result = await buildNotificationIncident(notification, { logSlug: null })
    expect(result.unavailable).toBeNull()
    expect(result.logContext).not.toBeNull()
    expect(result.logContext!.requests.some((r) => r.series === '5xx' && Number(r.value) > 0)).toBe(true)
  })

  it('returns no evidence and no error for a notification with no stored context', async () => {
    const notification = makeNotification({ type: 'down', context: null })
    const result = await buildNotificationIncident(notification, { logSlug: SLUG })
    expect(result.ipEvidence).toBeNull()
    expect(result.logContext).toBeNull()
    expect(result.unavailable).toBeNull()
  })

  it('returns just the stored facts for a context kind with no log query', async () => {
    const notification = makeNotification({
      type: 'ssl_expiring',
      context: { kind: 'ssl', daysRemaining: 5 },
    })
    const result = await buildNotificationIncident(notification, { logSlug: null })
    expect(result.ipEvidence).toBeNull()
    expect(result.logContext).toBeNull()
    expect(result.unavailable).toBeNull()
    expect(result.notification.context).toEqual({ kind: 'ssl', daysRemaining: 5 })
  })
})
