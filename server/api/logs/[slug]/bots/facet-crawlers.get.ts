import { facetCrawlers } from '../../../../utils/logs/queries/bots'
import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  return { crawlers: await facetCrawlers(ctx) }
})
