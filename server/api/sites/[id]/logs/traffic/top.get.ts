import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../../utils/logs/csv'
import { trafficTop } from '../../../../../utils/logs/queries/traffic'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  const dim = String(ctx.query.dim || 'path')
  const rows = await trafficTop(ctx, { dim, limit: Number(ctx.query.limit) })
  const result = respondListOrCsv(event, rows, 'top', `top-${dim}.csv`)
  return typeof result === 'string' ? result : { dim, ...result }
})
