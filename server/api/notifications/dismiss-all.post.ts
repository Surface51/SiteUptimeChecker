import { dismissAllNotifications } from '../../utils/db'

export default defineEventHandler((event) => {
  dismissAllNotifications()
  setResponseStatus(event, 204)
  return null
})
