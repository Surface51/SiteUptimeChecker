import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, listNotifications } from '../../../server/utils/db'
import { runLogAlerts } from '../../../server/utils/logs/alerts'
import { runIngest } from '../../../server/utils/logs/ingest/queue'
import { closeLogDb } from '../../../server/utils/logs/logDb'
import { makeSite, resetDb } from '../../helpers/db'

// Opening a DuckDB instance (native load, schema migration) before the first assertion can
// take several seconds on its own, and vitest runs these files in parallel with each other.
// The default 5s budget is for quick unit tests, not for standing up an analytical database.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const SLUG = 'alerting'
const SERVER_DIR = [SLUG, 'live', '10.0.0.5']

/** Access-log line dated `minutesAgo` before now, so it lands inside the alert's recent window. */
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
  const root = mkdtempSync(join(tmpdir(), 'uptime-checker-test-alerts-'))
  const dir = join(root, ...SERVER_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'nginx-access.log'), lines.join('\n') + '\n')
  await runIngest([root])
}

beforeEach(async () => {
  resetDb()
  await closeLogDb()
  // resetDb wipes the whole data dir, taking the DuckDB file with it.
})

afterAll(async () => {
  await closeLogDb()
})

describe('runLogAlerts', () => {
  it('raises a 5xx spike notification and then stays quiet during the cooldown', async () => {
    const site = makeSite({ name: 'Acme', logSlug: SLUG })

    const lines: string[] = []
    for (let i = 0; i < 60; i++) {
      lines.push(line({ minutesAgo: 30, status: 500, path: '/api/thing', clientIp: '203.0.113.5' }))
    }
    await ingestLines(lines)

    // The ingest run itself fires the alert pass.
    const first = listNotifications({ limit: 20 }).filter((n) => n.type === 'log_5xx_spike')
    expect(first).toHaveLength(1)
    expect(first[0]!.message).toContain('Acme')
    expect(first[0]!.siteId).toBe(site.id)

    // A second pass over the same data must not re-notify.
    await runLogAlerts()
    expect(listNotifications({ limit: 20 }).filter((n) => n.type === 'log_5xx_spike')).toHaveLength(1)
  })

  it('re-alerts once the cooldown has lapsed', async () => {
    makeSite({ name: 'Acme', logSlug: SLUG })

    const lines = Array.from({ length: 60 }, () =>
      line({ minutesAgo: 30, status: 500, path: '/api/thing', clientIp: '203.0.113.5' }),
    )
    await ingestLines(lines)
    expect(listNotifications({ limit: 20 }).filter((n) => n.type === 'log_5xx_spike')).toHaveLength(1)

    // Backdate the cooldown record rather than waiting six hours.
    getDb().prepare(`UPDATE log_alert_state SET last_fired_at = datetime('now', '-7 hours')`).run()

    await runLogAlerts()
    expect(listNotifications({ limit: 20 }).filter((n) => n.type === 'log_5xx_spike')).toHaveLength(2)
  })

  it('ignores a handful of errors below the floor', async () => {
    makeSite({ name: 'Quiet', logSlug: SLUG })

    const lines = Array.from({ length: 5 }, () =>
      line({ minutesAgo: 10, status: 500, path: '/rare', clientIp: '203.0.113.9' }),
    )
    await ingestLines(lines)

    expect(listNotifications({ limit: 20 }).filter((n) => n.type === 'log_5xx_spike')).toHaveLength(0)
  })

  it('reports a scanning address once, keyed by IP', async () => {
    makeSite({ name: 'Acme', logSlug: SLUG })

    const lines: string[] = []
    for (let i = 0; i < 120; i++) {
      lines.push(line({ minutesAgo: 20, status: 404, path: `/probe-${i}`, clientIp: '198.51.100.4' }))
    }
    await ingestLines(lines)

    const threats = listNotifications({ limit: 20 }).filter((n) => n.type === 'log_threat_ip')
    expect(threats).toHaveLength(1)
    expect(threats[0]!.message).toContain('198.51.100.4')

    await runLogAlerts()
    expect(listNotifications({ limit: 20 }).filter((n) => n.type === 'log_threat_ip')).toHaveLength(1)
  })

  it('does nothing for a site with no linked log folder', async () => {
    makeSite({ name: 'Unlinked' })

    const lines = Array.from({ length: 60 }, () =>
      line({ minutesAgo: 30, status: 500, path: '/api/thing', clientIp: '203.0.113.5' }),
    )
    await ingestLines(lines)

    expect(listNotifications({ limit: 20 })).toHaveLength(0)
  })
})
