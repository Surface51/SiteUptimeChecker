import { buildSiteSummary, getSiteByUrl, insertSite } from '../../utils/db'
import { parseSiteSettings } from '../../utils/siteSettings'
import { runCheck } from '../../utils/checks'
import { scheduleSite } from '../../utils/scheduler'
import { captureScreenshot } from '../../utils/screenshot'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)

  const settings = parseSiteSettings(body ?? {}, { partial: false })

  if (getSiteByUrl(settings.url!)) {
    throw createError({ statusCode: 409, statusMessage: 'Site already exists' })
  }

  const site = insertSite({
    url: settings.url!,
    name: settings.name ?? null,
    checkIntervalSeconds: settings.checkIntervalSeconds ?? 300,
    ...settings,
  })

  // Fire the initial check and screenshot in the background — don't make the caller wait for them.
  runCheck(site).catch((err) => console.error(`[checks] initial check failed for site ${site.id}:`, err))
  captureScreenshot(site.id, site.url)
  // The initial check above hasn't landed yet, so scheduleSite's "no prior check" path
  // would otherwise also fire almost immediately — explicitly wait one full interval instead.
  scheduleSite(site, site.checkIntervalSeconds * 1000)

  setResponseStatus(event, 201)
  return buildSiteSummary(site)
})
