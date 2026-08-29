import type { NotificationType } from '#shared/types'
import { getDb } from './db'

/**
 * Claim-or-skip against the `alert_state` cooldown table. Returns true (recording the firing)
 * only when this (site, type, fingerprint) triple has not fired within `cooldownHours` — so an
 * ongoing problem, which re-emits the same signal on every ingest run or domain refresh, produces
 * one notification rather than a bellful of duplicates.
 *
 * `fingerprint` distinguishes instances within a type: an offending IP, an expiry tier ("30d"),
 * a response-body hash. Leave it '' for alerts that are simply per-site.
 *
 * Lifted out of server/utils/logs/alerts.ts, where it began life as log-only.
 */
export function claimAlert(
  siteId: number,
  type: NotificationType,
  fingerprint = '',
  cooldownHours = 6,
): boolean {
  const db = getDb()
  const existing = db
    .prepare(
      `SELECT last_fired_at FROM alert_state
       WHERE site_id = ? AND alert_type = ? AND fingerprint = ?
         AND last_fired_at > datetime('now', ?)`,
    )
    .get(siteId, type, fingerprint, `-${cooldownHours} hours`)

  if (existing) return false

  db.prepare(
    `INSERT INTO alert_state (site_id, alert_type, fingerprint, last_fired_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(site_id, alert_type, fingerprint)
     DO UPDATE SET last_fired_at = datetime('now')`,
  ).run(siteId, type, fingerprint)

  return true
}
