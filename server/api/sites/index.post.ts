import { buildSiteSummary, getSiteByUrl, insertSite } from '../../utils/db'
import { normalizeSiteUrl } from '../../utils/url'
import { runCheck } from '../../utils/checks'
import { scheduleSite } from '../../utils/scheduler'
import { captureScreenshot } from '../../utils/screenshot'

const VALID_INTERVALS = new Set([60, 300, 900, 3600])

export default defineEventHandler(async (event) => {
  const body = await readBody<{ url?: string; name?: string; checkIntervalSeconds?: number }>(event)

  if (!body?.url || typeof body.url !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'url is required' })
  }

  let url: string
  try {
    url = normalizeSiteUrl(body.url)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid URL' })
  }

  if (getSiteByUrl(url)) {
    throw createError({ statusCode: 409, statusMessage: 'Site already exists' })
  }

  const checkIntervalSeconds = VALID_INTERVALS.has(body.checkIntervalSeconds ?? 300)
    ? (body.checkIntervalSeconds ?? 300)
    : 300

  const site = insertSite({
    url,
    name: body.name?.trim() || null,
    checkIntervalSeconds,
  })

  // Fire the initial check and screenshot in the background — don't make the caller wait for them.
  runCheck(site).catch((err) => console.error(`[checks] initial check failed for site ${site.id}:`, err))
  captureScreenshot(site.id, site.url)
  // The initial check above hasn't landed yet, so scheduleSite's "no prior check" path
  // would otherwise also fire almost immediately — explicitly wait one full interval instead.
  scheduleSite(site, checkIntervalSeconds * 1000)

  setResponseStatus(event, 201)
  return buildSiteSummary(site)
})
