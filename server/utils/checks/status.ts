import type { CheckStatus } from '#shared/types'

export const SSL_WARNING_DAYS = 7

export interface DetermineStatusInput {
  expectedStatus: number | null
  httpStatus: number | null
  error: string | null
  timeTotal: number | null
  degradedMs: number
  /** null when no SSL info is available for this check. */
  sslDaysRemaining: number | null
}

export function determineStatus(input: DetermineStatusInput): CheckStatus {
  let status: CheckStatus
  if (input.expectedStatus !== null) {
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
