import { getLatestSeoCrawl, listSeoPages } from '../../../../../utils/db'
import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'
import { crawlerStats } from '../../../../../utils/logs/queries/seo'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  const id = Number(getRouterParam(event, 'id'))
  const crawl = getLatestSeoCrawl(id)
  const sitemapPaths = crawl
    ? new Set(listSeoPages(crawl.id).filter((p) => p.inSitemap).map((p) => new URL(p.url).pathname))
    : null
  return crawlerStats(ctx, sitemapPaths)
})
