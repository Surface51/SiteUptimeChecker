import { clearSiteBodyChunks, getSite } from '../../../utils/db'
import { runCheck } from '../../../utils/checks'

/** Clears the content-watch reference and, when the watch is on, re-seeds it from a fresh check. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  clearSiteBodyChunks(id)
  if (site.contentWatch) await runCheck(site)

  return { ok: true }
})
