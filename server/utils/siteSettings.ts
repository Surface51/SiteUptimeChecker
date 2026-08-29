import { createError } from 'h3'
import type { BaselineMode } from '#shared/types'
import { normalizeLogSlug } from './logs/slug'
import { normalizeSiteUrl } from './url'

/**
 * The full editable settings surface of a site. `authPass` is a write-only tri-state:
 *   - undefined  → leave the stored password untouched
 *   - null       → clear it
 *   - string     → set it
 * Every other field, when present in a parse result, is a concrete value to write.
 */
export interface SiteSettings {
  url: string
  name: string | null
  checkIntervalSeconds: number
  degradedMs: number
  expectedStatus: number | null
  logSlug: string | null
  httpMethod: string
  requestHeaders: Record<string, string> | null
  requestBody: string | null
  authUser: string | null
  authPass?: string | null
  timeoutMs: number
  followRedirects: boolean
  acceptedStatuses: string | null
  contentExpect: string | null
  contentForbid: string | null
  contentRegex: string | null
  contentMinBytes: number | null
  baselineMode: BaselineMode
  contentWatch: boolean
  contentWatchSensitivity: number
  slaTarget: number | null
}

export const VALID_INTERVALS = new Set([60, 300, 900, 3600])
const VALID_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const MAX_REGEX_LEN = 200
const MAX_HEADER_COUNT = 30
const MAX_BODY_LEN = 8192

function bad(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

function trimOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') bad('Expected a string')
  const s = (v as string).trim()
  return s === '' ? null : s
}

function parseHeaderMap(v: unknown): Record<string, string> | null {
  if (v === null || v === undefined || v === '') return null
  let obj: unknown = v
  if (typeof v === 'string') {
    try {
      obj = JSON.parse(v)
    } catch {
      bad('Request headers must be valid JSON')
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) bad('Request headers must be a JSON object')
  const entries = Object.entries(obj as Record<string, unknown>)
  if (entries.length > MAX_HEADER_COUNT) bad(`Too many request headers (max ${MAX_HEADER_COUNT})`)
  const out: Record<string, string> = {}
  for (const [k, val] of entries) {
    if (!/^[A-Za-z0-9-]+$/.test(k)) bad(`Invalid header name: ${k}`)
    if (typeof val !== 'string') bad(`Header ${k} must be a string`)
    out[k] = val
  }
  return Object.keys(out).length ? out : null
}

/** Validates an accepted-status expression like "200", "200,204", "200-299", "2xx,3xx". */
export function assertAcceptedStatusesShape(expr: string): void {
  for (const partRaw of expr.split(',')) {
    const part = partRaw.trim().toLowerCase()
    if (!part) continue
    if (/^[1-5]xx$/.test(part)) continue
    if (/^\d{3}$/.test(part)) continue
    const range = /^(\d{3})-(\d{3})$/.exec(part)
    if (range && Number(range[1]) <= Number(range[2])) continue
    bad(`Invalid accepted-status term: "${partRaw.trim()}"`)
  }
}

/**
 * Parse (and validate) a site-settings body. With `partial: true` only the keys present in the
 * body are returned, for a PATCH; otherwise every field is resolved to a concrete default, for a
 * create. Throws a 400 `createError` on any invalid field.
 */
export function parseSiteSettings(body: Record<string, unknown>, opts: { partial: boolean }): Partial<SiteSettings> {
  const b = body ?? {}
  const out: Partial<SiteSettings> = {}
  const has = (k: string) => b[k] !== undefined
  const want = (k: string) => !opts.partial || has(k)

  // --- URL ---
  if (!opts.partial || has('url')) {
    if (typeof b.url !== 'string' || !b.url.trim()) bad('url is required')
    try {
      out.url = normalizeSiteUrl(b.url as string)
    } catch {
      bad('Invalid URL')
    }
  }

  if (want('name')) out.name = trimOrNull(b.name)

  if (want('checkIntervalSeconds')) {
    const n = Number(b.checkIntervalSeconds ?? 300)
    out.checkIntervalSeconds = VALID_INTERVALS.has(n) ? n : 300
  }

  if (want('degradedMs')) {
    const n = Number(b.degradedMs ?? 5000)
    if (!Number.isInteger(n) || n < 100 || n > 60_000) bad('Invalid degraded threshold')
    out.degradedMs = n
  }

  if (want('expectedStatus')) {
    const raw = b.expectedStatus
    if (raw === null || raw === undefined || raw === '') {
      out.expectedStatus = null
    } else {
      const n = Number(raw)
      if (!Number.isInteger(n) || n < 100 || n > 599) bad('Invalid expected status')
      out.expectedStatus = n
    }
  }

  if (want('logSlug')) {
    const slug = normalizeLogSlug((b.logSlug as string | null) ?? null)
    if (slug === undefined) bad('Invalid log folder name')
    out.logSlug = slug
  }

  // --- Request options ---
  if (want('httpMethod')) {
    const m = String(b.httpMethod ?? 'GET').toUpperCase()
    if (!VALID_METHODS.has(m)) bad(`Unsupported HTTP method: ${m}`)
    out.httpMethod = m
  }
  if (want('requestHeaders')) out.requestHeaders = parseHeaderMap(b.requestHeaders)
  if (want('requestBody')) {
    const s = trimOrNull(b.requestBody)
    if (s && s.length > MAX_BODY_LEN) bad(`Request body too large (max ${MAX_BODY_LEN} chars)`)
    out.requestBody = s
  }
  if (want('authUser')) out.authUser = trimOrNull(b.authUser)
  if (has('authPass')) {
    // Tri-state: '' or null clears, a string sets, absent (handled above) leaves as-is.
    out.authPass = b.authPass === null || b.authPass === '' ? null : String(b.authPass)
  }
  if (want('timeoutMs')) {
    const n = Number(b.timeoutMs ?? 15000)
    if (!Number.isInteger(n) || n < 1000 || n > 120_000) bad('Timeout must be 1000–120000 ms')
    out.timeoutMs = n
  }
  if (want('followRedirects')) out.followRedirects = b.followRedirects === undefined ? true : !!b.followRedirects
  if (want('acceptedStatuses')) {
    const s = trimOrNull(b.acceptedStatuses)
    if (s) assertAcceptedStatusesShape(s)
    out.acceptedStatuses = s
  }

  // --- Content assertions ---
  if (want('contentExpect')) out.contentExpect = trimOrNull(b.contentExpect)
  if (want('contentForbid')) out.contentForbid = trimOrNull(b.contentForbid)
  if (want('contentRegex')) {
    const s = trimOrNull(b.contentRegex)
    if (s) {
      if (s.length > MAX_REGEX_LEN) bad(`Regex too long (max ${MAX_REGEX_LEN} chars)`)
      try {
        // eslint-disable-next-line no-new
        new RegExp(s)
      } catch {
        bad('Invalid content regex')
      }
    }
    out.contentRegex = s
  }
  if (want('contentMinBytes')) {
    const raw = b.contentMinBytes
    if (raw === null || raw === undefined || raw === '') {
      out.contentMinBytes = null
    } else {
      const n = Number(raw)
      if (!Number.isInteger(n) || n < 0 || n > 50_000_000) bad('Invalid minimum content length')
      out.contentMinBytes = n
    }
  }

  // --- Adaptive baseline ---
  if (want('baselineMode')) {
    const m = String(b.baselineMode ?? 'fixed')
    out.baselineMode = m === 'adaptive' ? 'adaptive' : 'fixed'
  }

  // --- Content-change watch ---
  if (want('contentWatch')) out.contentWatch = !!b.contentWatch
  if (want('contentWatchSensitivity')) {
    const n = Number(b.contentWatchSensitivity ?? 30)
    if (!Number.isInteger(n) || n < 1 || n > 100) bad('Sensitivity must be 1–100')
    out.contentWatchSensitivity = n
  }

  // --- SLA target ---
  if (want('slaTarget')) {
    const raw = b.slaTarget
    if (raw === null || raw === undefined || raw === '') {
      out.slaTarget = null
    } else {
      const n = Number(raw)
      if (!Number.isFinite(n) || n <= 0 || n > 100) bad('SLA target must be between 0 and 100')
      out.slaTarget = n
    }
  }

  return out
}
