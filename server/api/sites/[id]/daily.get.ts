import { getDailyUptime, getSite } from '../../../utils/db'

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
  const days = Math.min(Math.max(Number(query.days) || 30, 1), 90)

  return getDailyUptime(id, days)
})
