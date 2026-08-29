import type { TriageItem, TriageSeverity } from '#shared/types'
import {
  getDb,
  getLatestCheck,
  getLatestWhoisRecord,
  getOpenIncident,
  getSlaReport,
  isInMaintenance,
  listSites,
} from './db'

const SEVERITY_RANK: Record<TriageSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const t = Date.parse(dateStr)
  if (Number.isNaN(t)) return null
  return Math.floor((t - Date.now()) / 86_400_000)
}

function sqlToMs(ts: string): number {
  return new Date(`${ts.replace(' ', 'T')}Z`).getTime()
}

/**
 * Builds the fleet-wide "what needs attention right now" list — one pass over the sites, merging
 * open incidents, failing assertions, expiring certs/domains, recent content changes, degraded
 * sites, blown SLA budgets, recent log alerts, and paused/stale monitors into one ranked list.
 */
export function buildTriage(): TriageItem[] {
  const sites = listSites()
  const items: TriageItem[] = []

  const recentAlerts = getDb()
    .prepare(
      `SELECT site_id, type, COUNT(*) AS n, MAX(created_at) AS last_at
       FROM notifications
       WHERE dismissed = 0 AND created_at > datetime('now', '-24 hours')
         AND type IN ('content_changed', 'log_5xx_spike', 'log_php_fatal', 'log_threat_ip')
       GROUP BY site_id, type`,
    )
    .all() as { site_id: number; type: string; n: number; last_at: string }[]
  const alertsBySite = new Map<number, { logCount: number; logLast: string | null; contentLast: string | null }>()
  for (const r of recentAlerts) {
    const e = alertsBySite.get(r.site_id) ?? { logCount: 0, logLast: null, contentLast: null }
    if (r.type === 'content_changed') e.contentLast = r.last_at
    else {
      e.logCount += r.n
      if (!e.logLast || r.last_at > e.logLast) e.logLast = r.last_at
    }
    alertsBySite.set(r.site_id, e)
  }

  for (const site of sites) {
    const label = site.name || site.url
    const sitePath = `/sites/${site.id}`
    const push = (severity: TriageSeverity, kind: string, detail: string, since: string | null, to = sitePath) =>
      items.push({
        id: `${site.id}:${kind}`,
        severity,
        siteId: site.id,
        siteName: label,
        siteUrl: site.url,
        kind,
        detail,
        since,
        to,
      })

    if (!site.enabled) {
      push('info', 'Paused', 'Monitoring is paused for this site.', null)
      continue
    }

    const inMaint = isInMaintenance(site.id)
    const latest = getLatestCheck(site.id)
    const openIncident = getOpenIncident(site.id)

    if (openIncident) {
      push(
        'critical',
        'Incident',
        `Down since ${openIncident.startedAt} — ${openIncident.cause ?? 'cause unknown'}.`,
        openIncident.startedAt,
      )
    }

    if (latest?.assertionFailed && !openIncident) {
      push('critical', 'Assertion', latest.assertionDetail || 'A content assertion is failing.', latest.checkedAt)
    }

    if (latest) {
      const ageMs = Date.now() - sqlToMs(latest.checkedAt)
      if (ageMs > site.checkIntervalSeconds * 1000 * 2.5) {
        push(
          'info',
          'Stale',
          `No check in ${Math.round(ageMs / 60000)} min (interval is ${Math.round(site.checkIntervalSeconds / 60)} min).`,
          latest.checkedAt,
        )
      }
    } else {
      push('info', 'Stale', 'No checks recorded yet.', null)
    }

    if (latest?.status === 'degraded' && !inMaint) {
      push('medium', 'Degraded', 'Latest check is degraded (slow response or SSL nearing expiry).', latest.checkedAt)
    }

    const certDays = latest?.sslDaysRemaining ?? null
    if (certDays !== null) {
      if (certDays < 7) push('high', 'Cert expiring', `TLS certificate expires in ${certDays} day${certDays === 1 ? '' : 's'}.`, null)
      else if (certDays < 30) push('medium', 'Cert expiring', `TLS certificate expires in ${certDays} days.`, null)
    }

    const whois = getLatestWhoisRecord(site.id)
    const domDays = daysUntil(whois?.expiryDate ?? null)
    if (domDays !== null) {
      if (domDays < 7) push('high', 'Domain expiring', `Domain registration expires in ${domDays} day${domDays === 1 ? '' : 's'}.`, null)
      else if (domDays < 60) push('medium', 'Domain expiring', `Domain registration expires in ${domDays} days.`, null)
    }

    const alerts = alertsBySite.get(site.id)
    if (alerts?.contentLast) {
      push('high', 'Content changed', 'Page content changed materially in the last 24h.', alerts.contentLast)
    }
    if (alerts?.logCount) {
      push(
        'low',
        'Log alerts',
        `${alerts.logCount} log alert${alerts.logCount === 1 ? '' : 's'} in the last 24h.`,
        alerts.logLast,
        site.logSlug ? `/sites/${site.id}/logs/errors` : sitePath,
      )
    }

    if (site.slaTarget !== null) {
      const sla = getSlaReport(site.id)
      if (sla && sla.budgetUsedPct > 100) {
        push(
          'medium',
          'SLA budget',
          `Error budget for ${sla.month} is ${Math.round(sla.budgetUsedPct)}% used (target ${sla.target}%).`,
          null,
        )
      }
    }
  }

  items.sort((a, b) => {
    const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (r !== 0) return r
    if (a.since && b.since) return a.since < b.since ? -1 : 1
    if (a.since) return -1
    if (b.since) return 1
    return a.siteName.localeCompare(b.siteName)
  })

  return items
}
