import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'
import { trafficOverview } from '../../../../utils/logs/queries/traffic'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  return trafficOverview(ctx)
})
