import { httpErrorTimeseries } from '../../../../../utils/logs/queries/errors'
import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  return httpErrorTimeseries(ctx)
})
