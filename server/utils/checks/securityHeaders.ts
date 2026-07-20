import type { SecurityHeadersReport } from '#shared/types'

const CHECKED_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
]

export function evaluateSecurityHeaders(headers: Record<string, string>): SecurityHeadersReport {
  const lower: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    lower[key.toLowerCase()] = value
  }

  const result: SecurityHeadersReport['headers'] = {}
  let score = 0

  for (const name of CHECKED_HEADERS) {
    const value = lower[name] ?? null
    const present = value !== null
    if (present) score++
    result[name] = { present, value }
  }

  return { headers: result, score, maxScore: CHECKED_HEADERS.length }
}
