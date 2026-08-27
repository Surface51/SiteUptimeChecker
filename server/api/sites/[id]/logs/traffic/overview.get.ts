import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'
import { trafficOverview } from '../../../../../utils/logs/queries/traffic'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  return trafficOverview(ctx)
})
