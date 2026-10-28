import { saveNotificationSettings } from '../utils/notificationSettings'

export default defineEventHandler(async (event) => {
  return saveNotificationSettings(await readBody(event))
})
