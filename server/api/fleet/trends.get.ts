import { getFleetTrends } from '../../utils/db'

const ALLOWED_DAYS = [7, 30, 90]

/** Fleet-wide daily uptime / p95 / incident series with a previous-period comparison. */
export default defineEventHandler((event) => {
  const days = Number(getQuery(event).days)
  return getFleetTrends(ALLOWED_DAYS.includes(days) ? days : 30)
})
