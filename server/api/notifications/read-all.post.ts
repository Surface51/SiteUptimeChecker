import { markAllNotificationsRead } from '../../utils/db'

export default defineEventHandler((event) => {
  markAllNotificationsRead()
  setResponseStatus(event, 204)
  return null
})
