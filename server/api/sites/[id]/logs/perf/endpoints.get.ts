import { perfEndpoints } from '../../../../../utils/logs/queries/perf'
import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../../utils/logs/csv'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  const rows = await perfEndpoints(ctx, {
    limit: Number(ctx.query.limit),
    sort: String(ctx.query.sort || 'p95'),
  })
  return respondListOrCsv(event, rows, 'endpoints', 'slow-endpoints.csv')
})
