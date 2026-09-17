import type { NotificationContext, NotificationRow } from '#shared/types'
import { rangeParams, resolveLogServers, sanitizeLogRows, serverIdsClause, type LogScope } from './logs/apiHelpers'
import { queryLogs } from './logs/logDb'
import { incidentContext } from './logs/queries/incidentContext'
import { ipProfile } from './logs/queries/security'
import { SUSPICIOUS_PATH_PATTERNS } from './logs/security'

// How far either side of the alert's own window to widen the log query — the same convention
// server/utils/logs/queries/incidentContext.ts uses, so a burst that started just before the
// window closed (or is still tailing off after) still shows up in the chart.
const PAD_MINUTES = 15

/** Evidence gathered for one notification's incident view. `null` fields mean "not applicable
 * to this context kind" rather than "failed to load" — see `unavailable` for that. */
export interface NotificationIncident {
  notification: NotificationRow
  unavailable: string | null
  ipEvidence: {
    profile: Record<string, unknown> | null
    recentRequests: Record<string, unknown>[]
    topPaths: (Record<string, unknown> & { suspicious: boolean })[]
    requestsPerMinute: { bucket: string; status: string; count: number }[]
  } | null
  logContext: Awaited<ReturnType<typeof incidentContext>> | null
}

function paddedScope(serverIds: number[], window: { from: string; to: string }): LogScope {
  const from = new Date(new Date(window.from).getTime() - PAD_MINUTES * 60_000)
  const to = new Date(new Date(window.to).getTime() + PAD_MINUTES * 60_000)
  return { serverIds, from, to }
}

function isSuspiciousPath(path: unknown): boolean {
  const value = String(path ?? '')
  return SUSPICIOUS_PATH_PATTERNS.some((p) => value.toLowerCase().includes(p.toLowerCase()))
}

async function requestsPerMinuteForIp(scope: LogScope, ip: string) {
  const rows = await queryLogs(
    `SELECT time_bucket(INTERVAL '1 minute', ts) AS bucket,
            CASE WHEN status >= 400 THEN 'error' ELSE 'ok' END AS status,
            count(*) AS count
     FROM access_log
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND client_ip = $ip AND ts BETWEEN $from AND $to
     GROUP BY 1, 2
     ORDER BY 1`,
    { ...rangeParams(scope), ip },
  )
  return sanitizeLogRows(rows) as { bucket: string; status: string; count: number }[]
}

async function threatIpEvidence(
  context: Extract<NotificationContext, { kind: 'threat_ip' }>,
): Promise<Pick<NotificationIncident, 'ipEvidence' | 'unavailable'>> {
  try {
    const { serverIds } = await resolveLogServers(context.logSlug)
    if (serverIds.length === 0) {
      return { ipEvidence: null, unavailable: 'No log servers are linked to this site anymore.' }
    }
    const scope = paddedScope(serverIds, context.window)
    const [profile, requestsPerMinute] = await Promise.all([
      ipProfile(scope, context.ip),
      requestsPerMinuteForIp(scope, context.ip),
    ])

    return {
      ipEvidence: {
        profile: profile.profile,
        recentRequests: profile.recentRequests,
        topPaths: profile.topPaths.map((row) => ({ ...row, suspicious: isSuspiciousPath(row.path_pattern) })),
        requestsPerMinute,
      },
      unavailable: null,
    }
  } catch (err) {
    console.error('[notifications] threat_ip incident query failed:', err)
    return { ipEvidence: null, unavailable: 'Log data for this incident could not be loaded.' }
  }
}

async function logSpikeContext(
  logSlug: string,
  window: { from: string; to: string },
): Promise<Pick<NotificationIncident, 'logContext' | 'unavailable'>> {
  try {
    const { serverIds } = await resolveLogServers(logSlug)
    if (serverIds.length === 0) {
      return { logContext: null, unavailable: 'No log servers are linked to this site anymore.' }
    }
    const scope = paddedScope(serverIds, window)
    return { logContext: await incidentContext(scope), unavailable: null }
  } catch (err) {
    console.error('[notifications] log_spike incident query failed:', err)
    return { logContext: null, unavailable: 'Log data for this incident could not be loaded.' }
  }
}

/** Same log-context join, anchored to when the notification fired rather than a stored window —
 * an uptime check transition doesn't carry an explicit window the way a log-derived alert does. */
async function checkIncidentContext(
  logSlug: string,
  createdAt: string,
): Promise<Pick<NotificationIncident, 'logContext' | 'unavailable'>> {
  // `createdAt` comes from SQLite as "YYYY-MM-DD HH:MM:SS" (space, no zone, implicitly UTC) — the
  // same shape app/utils/notificationDisplay.ts parses, and the same fix-up it applies.
  const instant = new Date(`${createdAt.replace(' ', 'T')}Z`).toISOString()
  return logSpikeContext(logSlug, { from: instant, to: instant })
}

/**
 * Builds the evidence panel for one notification, dispatching on its stored context. Notifications
 * from before `context` existed (or whose context kind carries no log query) get `ipEvidence` and
 * `logContext` both `null` with no `unavailable` message — the page falls back to the stored facts.
 */
export async function buildNotificationIncident(
  notification: NotificationRow,
  site: { logSlug: string | null },
): Promise<NotificationIncident> {
  const base: NotificationIncident = {
    notification,
    unavailable: null,
    ipEvidence: null,
    logContext: null,
  }

  const context = notification.context
  if (!context) return base

  switch (context.kind) {
    case 'threat_ip': {
      const { ipEvidence, unavailable } = await threatIpEvidence(context)
      return { ...base, ipEvidence, unavailable }
    }
    case 'log_spike': {
      const { logContext, unavailable } = await logSpikeContext(context.logSlug, context.window)
      return { ...base, logContext, unavailable }
    }
    case 'check': {
      if (!site.logSlug) return base
      const { logContext, unavailable } = await checkIncidentContext(site.logSlug, notification.createdAt)
      return { ...base, logContext, unavailable }
    }
    default:
      // ssl / domain / content / lighthouse — the stored context fields are the whole story;
      // no log query applies.
      return base
  }
}
