import type { CheckStatus } from '#shared/types'
import { getCheckLog, getSite } from '../../../utils/db'

const VALID_STATUSES = new Set<CheckStatus>(['up', 'degraded', 'down'])

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
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200)
  const offset = Math.max(Number(query.offset) || 0, 0)
  const status = typeof query.status === 'string' && VALID_STATUSES.has(query.status as CheckStatus)
    ? (query.status as CheckStatus)
    : undefined

  return getCheckLog(id, { limit, offset, status })
})
