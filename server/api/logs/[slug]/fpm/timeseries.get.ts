import { fpmTimeseries } from '../../../../utils/logs/queries/stack'
import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  return fpmTimeseries(ctx)
})
