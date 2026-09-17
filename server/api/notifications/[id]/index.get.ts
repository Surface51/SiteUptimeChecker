import { getNotification } from '../../../utils/db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid notification id' })
  }

  const notification = getNotification(id)
  if (!notification) {
    throw createError({ statusCode: 404, statusMessage: 'Notification not found' })
  }

  return notification
})
