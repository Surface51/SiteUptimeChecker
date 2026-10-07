import { getSite } from '../../../utils/db'
import { retakeScreenshot } from '../../../utils/screenshot'

/** Retakes the site's screenshot now and waits for it, so the caller can show the new image. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  try {
    await retakeScreenshot(site.id, site.url)
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `Screenshot failed: ${err?.message || err}` })
  }
  return { ok: true }
})
