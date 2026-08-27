import { buildSiteSummary, getSite, updateSite } from '../../utils/db'
import { normalizeLogSlug } from '../../utils/logs/slug'
import { normalizeSiteUrl } from '../../utils/url'
import { scheduleSite, unscheduleSite } from '../../utils/scheduler'

const VALID_INTERVALS = new Set([60, 300, 900, 3600])

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const existing = getSite(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  const body = await readBody<{
    url?: string
    name?: string | null
    checkIntervalSeconds?: number
    enabled?: boolean
    degradedMs?: number
    expectedStatus?: number | null
    logSlug?: string | null
  }>(event)

  const patch: Parameters<typeof updateSite>[1] = {}

  if (body.url !== undefined) {
    try {
      patch.url = normalizeSiteUrl(body.url)
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid URL' })
    }
  }
  if (body.name !== undefined) patch.name = body.name?.trim() || null
  if (body.checkIntervalSeconds !== undefined) {
    if (!VALID_INTERVALS.has(body.checkIntervalSeconds)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid check interval' })
    }
    patch.checkIntervalSeconds = body.checkIntervalSeconds
  }
  if (body.enabled !== undefined) patch.enabled = body.enabled
  if (body.degradedMs !== undefined) {
    if (!Number.isInteger(body.degradedMs) || body.degradedMs < 100 || body.degradedMs > 60_000) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid degraded threshold' })
    }
    patch.degradedMs = body.degradedMs
  }
  if (body.expectedStatus !== undefined) {
    if (body.expectedStatus !== null && (!Number.isInteger(body.expectedStatus) || body.expectedStatus < 100 || body.expectedStatus > 599)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid expected status' })
    }
    patch.expectedStatus = body.expectedStatus
  }
  if (body.logSlug !== undefined) {
    const logSlug = normalizeLogSlug(body.logSlug)
    if (logSlug === undefined) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid log folder name' })
    }
    patch.logSlug = logSlug
  }

  const site = updateSite(id, patch)!

  if (site.enabled) {
    scheduleSite(site)
  } else {
    unscheduleSite(site.id)
  }

  return buildSiteSummary(site)
})
