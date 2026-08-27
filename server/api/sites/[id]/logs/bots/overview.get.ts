import { botsOverview } from '../../../../../utils/logs/queries/bots'
import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  return botsOverview(ctx)
})
