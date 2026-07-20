import type { CheckRow, Site } from '#shared/types'
import { insertNotification } from './db'

const SSL_NOTIFY_THRESHOLD_DAYS = 14

export function detectAndNotify(site: Site, previous: CheckRow | null, current: CheckRow) {
  const label = site.name || site.url

  if (current.status === 'down' && previous?.status !== 'down') {
    const reason = current.httpStatus ? `HTTP ${current.httpStatus}` : current.error || 'unreachable'
    insertNotification({ siteId: site.id, type: 'down', message: `${label} is down (${reason})` })
  } else if (current.status !== 'down' && previous?.status === 'down') {
    insertNotification({ siteId: site.id, type: 'up', message: `${label} is back up` })
  } else if (current.status === 'degraded' && previous?.status === 'up') {
    insertNotification({ siteId: site.id, type: 'degraded', message: `${label} is degraded (slow response or SSL nearing expiry)` })
  }

  const prevDays = previous?.sslDaysRemaining ?? null
  const curDays = current.sslDaysRemaining
  if (curDays !== null && curDays < SSL_NOTIFY_THRESHOLD_DAYS && (prevDays === null || prevDays >= SSL_NOTIFY_THRESHOLD_DAYS)) {
    insertNotification({
      siteId: site.id,
      type: 'ssl_expiring',
      message: `${label} SSL certificate expires in ${curDays} day${curDays === 1 ? '' : 's'}`,
    })
  }
}
