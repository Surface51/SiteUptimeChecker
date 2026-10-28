import type { CheckRow, Site } from '#shared/types'
import { getAlertedStatus, getRecentStatuses, insertNotification, setAlertedStatus } from './db'
import { claimAlert } from './alertState'
import { resolveForSite } from './notificationSettings'
import { evaluateStatusAlert } from './statusAlerts'

const SSL_NOTIFY_THRESHOLD_DAYS = 14
const DEGRADED_COOLDOWN_HOURS = 1
const FLAPPING_COOLDOWN_HOURS = 6

export function detectAndNotify(site: Site, previous: CheckRow | null, current: CheckRow) {
  const label = site.name || site.url
  const cfg = resolveForSite(site)
  const alerted = getAlertedStatus(site.id)
  // Reads the statuses back from the DB (the new check is already stored), since a decision now
  // spans several checks rather than just previous → current.
  const recent = getRecentStatuses(site.id, Math.max(cfg.flap.window, 10))
  const decision = evaluateStatusAlert(recent, alerted, cfg)

  if (decision.nextAlerted !== alerted) setAlertedStatus(site.id, decision.nextAlerted)

  if (decision.emit === 'down') {
    const reason = current.assertionFailed
      ? current.assertionDetail || 'content assertion failed'
      : current.httpStatus
        ? `HTTP ${current.httpStatus}`
        : current.error || 'unreachable'
    insertNotification({
      siteId: site.id,
      type: 'down',
      message: `${label} is down (${reason})`,
      context: { kind: 'check', httpStatus: current.httpStatus, reason },
    })
  } else if (decision.emit === 'up') {
    insertNotification({
      siteId: site.id,
      type: 'up',
      message: `${label} is back up`,
      context: { kind: 'check', httpStatus: current.httpStatus, reason: null },
    })
  } else if (decision.emit === 'degraded' && claimAlert(site.id, 'degraded', '', DEGRADED_COOLDOWN_HOURS)) {
    insertNotification({
      siteId: site.id,
      type: 'degraded',
      message: `${label} is degraded (slow response or SSL nearing expiry)`,
      context: { kind: 'check', httpStatus: current.httpStatus, reason: null },
    })
  } else if (decision.emit === 'flapping' && claimAlert(site.id, 'flapping', '', FLAPPING_COOLDOWN_HOURS)) {
    const reason = `${decision.flapTransitions} status changes in the last ${cfg.flap.window} checks`
    insertNotification({
      siteId: site.id,
      type: 'flapping',
      message: `${label} is flapping (${reason}) — down/up alerts paused until it settles`,
      context: { kind: 'check', httpStatus: current.httpStatus, reason },
    })
  }

  const prevDays = previous?.sslDaysRemaining ?? null
  const curDays = current.sslDaysRemaining
  if (curDays !== null && curDays < SSL_NOTIFY_THRESHOLD_DAYS && (prevDays === null || prevDays >= SSL_NOTIFY_THRESHOLD_DAYS)) {
    insertNotification({
      siteId: site.id,
      type: 'ssl_expiring',
      message: `${label} SSL certificate expires in ${curDays} day${curDays === 1 ? '' : 's'}`,
      context: { kind: 'ssl', daysRemaining: curDays },
    })
  }

  // A certificate whose issuer changed between checks is either a routine renewal to the same CA
  // (silent) or a switch to a different one — worth a heads-up, since it can also mean a MITM.
  const prevIssuer = previous?.sslIssuer ?? null
  const curIssuer = current.sslIssuer ?? null
  if (
    prevIssuer &&
    curIssuer &&
    prevIssuer !== curIssuer &&
    claimAlert(site.id, 'ssl_issuer_changed', curIssuer, 24)
  ) {
    insertNotification({
      siteId: site.id,
      type: 'ssl_issuer_changed',
      message: `${label} certificate issuer changed from "${prevIssuer}" to "${curIssuer}"`,
      context: { kind: 'ssl', issuerFrom: prevIssuer, issuerTo: curIssuer },
    })
  }
}
