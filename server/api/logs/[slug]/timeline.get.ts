import { correlationTimeline } from '../../../utils/logs/queries/timeline'
import { resolveLogQueryForSlug } from '../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  return correlationTimeline(ctx)
})
