import { listNotifications } from '../../utils/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200)
  return listNotifications(limit)
})
