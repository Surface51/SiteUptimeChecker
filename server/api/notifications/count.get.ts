import { countNotifications } from '../../utils/db'
import { parseNotificationType, parseNotificationTypes } from '../../utils/notificationQuery'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const siteId = query.siteId !== undefined ? Number(query.siteId) : undefined
  const type = parseNotificationType(query.type)
  const types = parseNotificationTypes(query.types)
  const unreadOnly = query.unreadOnly === 'true' || query.unreadOnly === '1'
  const includeDismissed = query.includeDismissed === 'true' || query.includeDismissed === '1'
  const q = typeof query.q === 'string' && query.q.trim() ? query.q.trim() : undefined

  return {
    count: countNotifications({
      siteId: siteId !== undefined && Number.isInteger(siteId) ? siteId : undefined,
      type,
      types,
      unreadOnly,
      includeDismissed,
      q,
    }),
  }
})
