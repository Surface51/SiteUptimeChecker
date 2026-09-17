import { getNotification, getSite } from '../../../utils/db'
import { buildNotificationIncident } from '../../../utils/notificationIncident'

/**
 * The evidence panel for one notification — what /notifications/:id renders. Delegates entirely
 * to buildNotificationIncident, which dispatches on the notification's stored context.
 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid notification id' })
  }

  const notification = getNotification(id)
  if (!notification) {
    throw createError({ statusCode: 404, statusMessage: 'Notification not found' })
  }

  const site = getSite(notification.siteId)
  return buildNotificationIncident(notification, { logSlug: site?.logSlug ?? null })
})
