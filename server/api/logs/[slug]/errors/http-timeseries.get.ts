import { httpErrorTimeseries } from '../../../../utils/logs/queries/errors'
import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  return httpErrorTimeseries(ctx)
})
