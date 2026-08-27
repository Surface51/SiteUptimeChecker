import { buildSiteSummary, getSiteByUrl, insertSite } from '../../utils/db'
import { normalizeLogSlug } from '../../utils/logs/slug'
import { normalizeSiteUrl } from '../../utils/url'
import { runCheck } from '../../utils/checks'
import { scheduleSite } from '../../utils/scheduler'
import { captureScreenshot } from '../../utils/screenshot'

const VALID_INTERVALS = new Set([60, 300, 900, 3600])

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    url?: string
    name?: string
    checkIntervalSeconds?: number
    degradedMs?: number
    expectedStatus?: number | null
    logSlug?: string | null
  }>(event)

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

  if (body.degradedMs !== undefined && (!Number.isInteger(body.degradedMs) || body.degradedMs < 100 || body.degradedMs > 60_000)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid degraded threshold' })
  }
  if (
    body.expectedStatus !== undefined &&
    body.expectedStatus !== null &&
    (!Number.isInteger(body.expectedStatus) || body.expectedStatus < 100 || body.expectedStatus > 599)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid expected status' })
  }

  const logSlug = normalizeLogSlug(body.logSlug ?? null)
  if (logSlug === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid log folder name' })
  }

  const site = insertSite({
    url,
    name: body.name?.trim() || null,
    checkIntervalSeconds,
    degradedMs: body.degradedMs,
    expectedStatus: body.expectedStatus ?? null,
    logSlug,
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
