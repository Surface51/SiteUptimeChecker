import type { NotificationType } from '#shared/types'
import { listNotifications } from '../../utils/db'

const VALID_TYPES: NotificationType[] = ['down', 'up', 'degraded', 'ssl_expiring', 'lighthouse_regression']

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200)
  const offset = Math.max(Number(query.offset) || 0, 0)
  const siteId = query.siteId !== undefined ? Number(query.siteId) : undefined
  const type = VALID_TYPES.includes(query.type as NotificationType) ? (query.type as NotificationType) : undefined
  const unreadOnly = query.unreadOnly === 'true' || query.unreadOnly === '1'
  const includeDismissed = query.includeDismissed === 'true' || query.includeDismissed === '1'

  return listNotifications({
    limit,
    offset,
    siteId: siteId !== undefined && Number.isInteger(siteId) ? siteId : undefined,
    type,
    unreadOnly,
    includeDismissed,
  })
})
