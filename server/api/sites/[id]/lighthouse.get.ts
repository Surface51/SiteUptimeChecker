import type { LighthouseFormFactor } from '#shared/types'
import { getLighthouseHistory, getSite } from '../../../utils/db'

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
  const formFactor: LighthouseFormFactor = query.formFactor === 'desktop' ? 'desktop' : 'mobile'
  const days = Math.min(Math.max(Number(query.days) || 30, 1), 180)
  const limit = Math.min(Math.max(Number(query.limit) || 500, 1), 2000)

  return getLighthouseHistory(id, formFactor, days, limit)
})
