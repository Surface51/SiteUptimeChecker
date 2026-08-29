import { buildSiteSummary, getSite, updateSite } from '../../utils/db'
import { parseSiteSettings } from '../../utils/siteSettings'
import { scheduleSite, unscheduleSite } from '../../utils/scheduler'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const existing = getSite(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  const body = await readBody<Record<string, unknown>>(event)

  const patch: Parameters<typeof updateSite>[1] = parseSiteSettings(body ?? {}, { partial: true })
  if (body?.enabled !== undefined) patch.enabled = !!body.enabled

  const site = updateSite(id, patch)!

  if (site.enabled) {
    scheduleSite(site)
  } else {
    unscheduleSite(site.id)
  }

  return buildSiteSummary(site)
})
