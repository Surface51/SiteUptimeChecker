import { getSite, getWhoisHistory } from '../../../utils/db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  const query = getQuery(event)
  const days = Math.min(Math.max(Number(query.days) || 730, 1), 730)
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500)

  return getWhoisHistory(id, days, limit)
})
