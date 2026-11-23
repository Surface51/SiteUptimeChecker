import { getSite } from '../../../../utils/db'
import { enqueueSeoCrawl } from '../../../../utils/seo/scheduler'

/** Queue an on-demand crawl (ignores the once-a-week throttle). Returns the job to poll. */
export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  return enqueueSeoCrawl(site, { force: true })
})
