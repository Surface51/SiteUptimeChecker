import { correlationTimeline } from '../../../../utils/logs/queries/timeline'
import { resolveLogQueryForSite } from '../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  return correlationTimeline(ctx)
})
