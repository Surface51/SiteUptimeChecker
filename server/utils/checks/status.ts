import type { CheckStatus } from '#shared/types'

export const SSL_WARNING_DAYS = 7

/**
 * Does `status` satisfy an accepted-status expression like "200", "200,204", "200-299",
 * "2xx,3xx"? Terms are OR'd. An empty / whitespace expression matches nothing (callers should
 * treat null as "not configured" rather than passing "").
 */
export function statusMatchesAccepted(status: number | null, expr: string): boolean {
  if (status === null) return false
  for (const partRaw of expr.split(',')) {
    const part = partRaw.trim().toLowerCase()
    if (!part) continue
    const cls = /^([1-5])xx$/.exec(part)
    if (cls) {
      if (Math.floor(status / 100) === Number(cls[1])) return true
      continue
    }
    if (/^\d{3}$/.test(part)) {
      if (status === Number(part)) return true
      continue
    }
    const range = /^(\d{3})-(\d{3})$/.exec(part)
    if (range && status >= Number(range[1]) && status <= Number(range[2])) return true
  }
  return false
}

export interface DetermineStatusInput {
  expectedStatus: number | null
  /** Accepted-status expression; takes precedence over expectedStatus when set. */
  acceptedStatuses: string | null
  httpStatus: number | null
  error: string | null
  timeTotal: number | null
  /** The degraded threshold actually in force — fixed or adaptively resolved by the caller. */
  degradedMs: number
  /** null when no SSL info is available for this check. */
  sslDaysRemaining: number | null
  /** A configured content assertion failed — forces 'down'. */
  assertionFailed: boolean
}

export function determineStatus(input: DetermineStatusInput): CheckStatus {
  if (input.assertionFailed) return 'down'

  let status: CheckStatus
  if (input.acceptedStatuses) {
    status =
      !input.error && statusMatchesAccepted(input.httpStatus, input.acceptedStatuses) ? 'up' : 'down'
  } else if (input.expectedStatus !== null) {
    status = input.httpStatus === input.expectedStatus ? 'up' : 'down'
  } else if (input.error || input.httpStatus === null || input.httpStatus >= 400) {
    status = 'down'
  } else {
    status = 'up'
  }

  if (
    status === 'up' &&
    ((input.timeTotal !== null && input.timeTotal > input.degradedMs) ||
      (input.sslDaysRemaining !== null && input.sslDaysRemaining < SSL_WARNING_DAYS))
  ) {
    status = 'degraded'
  }

  return status
}
