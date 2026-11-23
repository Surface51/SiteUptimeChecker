import { getLatestSeoCrawl, getSeoCrawl, getSite, listSeoPages } from '../../../../utils/db'

/** Pages from one crawl (`?crawl=<id>`), defaulting to the site's latest finished crawl. */
export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  const q = getQuery(event)
  const crawl = q.crawl ? getSeoCrawl(Number(q.crawl)) : getLatestSeoCrawl(id)
  if (!crawl || crawl.siteId !== id) return { crawl: null, pages: [] }
  return { crawl, pages: listSeoPages(crawl.id) }
})
