import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'
import { trafficTimeseries } from '../../../../../utils/logs/queries/traffic'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  return trafficTimeseries(ctx, {
    metric: String(ctx.query.metric || 'requests'),
    interval: String(ctx.query.interval || 'auto'),
    groupBy: String(ctx.query.groupBy || 'none'),
  })
})
