import type { CheckRow, Site } from '#shared/types'
import { insertNotification } from './db'
import { claimAlert } from './alertState'

const SSL_NOTIFY_THRESHOLD_DAYS = 14

export function detectAndNotify(site: Site, previous: CheckRow | null, current: CheckRow) {
  const label = site.name || site.url

  if (current.status === 'down' && previous?.status !== 'down') {
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
  } else if (current.status !== 'down' && previous?.status === 'down') {
    insertNotification({
      siteId: site.id,
      type: 'up',
      message: `${label} is back up`,
      context: { kind: 'check', httpStatus: current.httpStatus, reason: null },
    })
  } else if (current.status === 'degraded' && previous?.status === 'up') {
    insertNotification({
      siteId: site.id,
      type: 'degraded',
      message: `${label} is degraded (slow response or SSL nearing expiry)`,
      context: { kind: 'check', httpStatus: current.httpStatus, reason: null },
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
