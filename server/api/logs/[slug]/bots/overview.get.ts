import { botsOverview } from '../../../../utils/logs/queries/bots'
import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  return botsOverview(ctx)
})
