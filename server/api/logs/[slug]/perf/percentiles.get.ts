import { perfPercentiles } from '../../../../utils/logs/queries/perf'
import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  return perfPercentiles(ctx)
})
