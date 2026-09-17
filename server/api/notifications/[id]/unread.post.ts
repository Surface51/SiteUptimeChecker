import { setNotificationRead } from '../../../utils/db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid notification id' })
  }

  setNotificationRead(id, false)
  setResponseStatus(event, 204)
  return null
})
