import { perfPercentiles } from '../../../../../utils/logs/queries/perf'
import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  return perfPercentiles(ctx)
})
