import { getSite } from '../../../utils/db'
import { runCheck } from '../../../utils/checks'
import { scheduleSite } from '../../../utils/scheduler'
import { captureScreenshot } from '../../../utils/screenshot'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  const result = await runCheck(site)

  if (result.status !== 'down') {
    captureScreenshot(site.id, site.url)
  }

  if (site.enabled) {
    scheduleSite(site, site.checkIntervalSeconds * 1000)
  }

  return result
})
