import { buildComparison } from '../utils/db'

// Cap selection so overlay charts stay readable — the shared series palette has 6 colors.
const MAX_SITES = 6

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const idsParam = typeof query.ids === 'string' ? query.ids : ''
  const ids = [
    ...new Set(
      idsParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].slice(0, MAX_SITES)

  if (!ids.length) {
    throw createError({ statusCode: 400, statusMessage: 'ids query param is required (comma-separated site ids)' })
  }

  const hours = Math.min(Math.max(Number(query.hours) || 24 * 7, 1), 24 * 30)

  return buildComparison(ids, hours)
})
