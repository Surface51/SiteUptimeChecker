import { fpmTimeseries } from '../../../../../utils/logs/queries/stack'
import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  return fpmTimeseries(ctx)
})
