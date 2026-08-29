import type { NotificationType } from '#shared/types'
import { insertNotification, listSites } from '../db'
import { claimAlert as claimAlertShared } from '../alertState'
import { rangeParams, serverIdsClause, resolveLogServers, type LogScope } from './apiHelpers'
import { queryLogs } from './logDb'

// How long a given alert stays quiet after firing. An ongoing incident produces the same signal
// on every ingest run; without this the notification bell would fill up with duplicates of one
// problem rather than telling the operator about distinct ones.
const COOLDOWN_HOURS = 6

// The recent window an alert judges, and the baseline it is compared against.
const WINDOW_HOURS = 1
const BASELINE_HOURS = 6

// Floors that stop a quiet site from alerting on statistical noise: two errors where there was
// previously one is a 100% jump and means nothing.
const MIN_5XX = 20
const MIN_FATALS = 10
const SPIKE_FACTOR = 3

/** True when this alert hasn't fired within the cooldown, recording the firing if so. */
function claimAlert(siteId: number, type: NotificationType, fingerprint = ''): boolean {
  return claimAlertShared(siteId, type, fingerprint, COOLDOWN_HOURS)
}

function scopeFor(serverIds: number[], hoursAgo: number, untilHoursAgo = 0): LogScope {
  const now = Date.now()
  return {
    serverIds,
    from: new Date(now - hoursAgo * 3_600_000),
    to: new Date(now - untilHoursAgo * 3_600_000),
  }
}

async function countRows(scope: LogScope, table: string, timeColumn: string, extra = ''): Promise<number> {
  const rows = await queryLogs(
    `SELECT count(*) AS n FROM ${table}
     WHERE server_id IN ${serverIdsClause(scope.serverIds)}
       AND ${timeColumn} BETWEEN $from AND $to ${extra}`,
    rangeParams(scope),
  )
  return Number(rows[0]?.n ?? 0)
}

/**
 * Compares the last hour against the preceding six. Returns the recent count when it both clears
 * the floor and stands well above the hourly baseline, otherwise null.
 */
function spike(recent: number, baseline: number, floor: number): number | null {
  if (recent < floor) return null
  const baselineHourly = baseline / BASELINE_HOURS
  // A site with no prior errors at all should still alert once it crosses the floor.
  if (baselineHourly === 0 || recent >= baselineHourly * SPIKE_FACTOR) return recent
  return null
}

async function checkSite(siteId: number, slug: string, label: string): Promise<void> {
  const { serverIds } = await resolveLogServers(slug)
  if (serverIds.length === 0) return

  const recent = scopeFor(serverIds, WINDOW_HOURS)
  const baseline = scopeFor(serverIds, WINDOW_HOURS + BASELINE_HOURS, WINDOW_HOURS)

  // 5xx spike
  const recent5xx = await countRows(recent, 'access_log', 'ts', 'AND status >= 500')
  const baseline5xx = await countRows(baseline, 'access_log', 'ts', 'AND status >= 500')
  const spiked = spike(recent5xx, baseline5xx, MIN_5XX)
  if (spiked !== null && claimAlert(siteId, 'log_5xx_spike')) {
    insertNotification({
      siteId,
      type: 'log_5xx_spike',
      message: `${label} served ${spiked.toLocaleString()} 5xx responses in the last hour (${Math.round(baseline5xx / BASELINE_HOURS)}/hr before).`,
    })
  }

  // PHP fatals
  const fatalFilter = `AND (error_type ILIKE '%fatal%' OR error_type ILIKE '%parse%')`
  const recentFatals = await countRows(recent, 'php_error', 'ts', fatalFilter)
  const baselineFatals = await countRows(baseline, 'php_error', 'ts', fatalFilter)
  const fatalSpike = spike(recentFatals, baselineFatals, MIN_FATALS)
  if (fatalSpike !== null && claimAlert(siteId, 'log_php_fatal')) {
    insertNotification({
      siteId,
      type: 'log_php_fatal',
      message: `${label} logged ${fatalSpike.toLocaleString()} PHP fatal errors in the last hour.`,
    })
  }

  // Newly-appearing scanners: addresses generating a burst of 404s in the last hour. Keyed by
  // address so each new offender is reported once and an ongoing one stays quiet.
  const offenders = await queryLogs(
    `SELECT client_ip, count(*) AS hits
     FROM access_log
     WHERE server_id IN ${serverIdsClause(serverIds)} AND ts BETWEEN $from AND $to AND status = 404
     GROUP BY client_ip
     HAVING count(*) >= 100
     ORDER BY hits DESC
     LIMIT 3`,
    rangeParams(recent),
  )

  for (const row of offenders) {
    const ip = String(row.client_ip)
    if (!claimAlert(siteId, 'log_threat_ip', ip)) continue
    insertNotification({
      siteId,
      type: 'log_threat_ip',
      message: `${ip} hit ${label} with ${Number(row.hits).toLocaleString()} not-found requests in the last hour.`,
    })
  }
}

/**
 * Turns freshly-ingested log rows into notifications, so log signals reach the same bell and
 * toasts as uptime events. Called at the end of every ingest run.
 *
 * Deliberately never throws into its caller: an alerting problem must not fail an ingest that
 * has already written its rows.
 */
export async function runLogAlerts(): Promise<void> {
  try {
    const linked = listSites().filter((site) => site.enabled && site.logSlug)

    for (const site of linked) {
      const label = site.name || site.url
      try {
        await checkSite(site.id, site.logSlug!, label)
      } catch (err) {
        console.error(`[logs] alert check failed for site ${site.id}:`, err)
      }
    }
  } catch (err) {
    console.error('[logs] alert pass failed:', err)
  }
}
