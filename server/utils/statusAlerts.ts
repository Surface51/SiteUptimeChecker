import type { CheckStatus } from '#shared/types'

/** What we last told the user about a site; `flapping` means down/up alerts are being held back. */
export type AlertedStatus = CheckStatus | 'flapping'

export interface StatusAlertConfig {
  downConfirmations: number
  recoveryConfirmations: number
  degradedConfirmations: number
  flap: { window: number; transitions: number }
}

export interface StatusAlertDecision {
  emit: 'down' | 'up' | 'degraded' | 'flapping' | null
  /** The status to record as alerted-about; equals the input when nothing changed. */
  nextAlerted: AlertedStatus
  /** Set with `emit: 'flapping'`, for the message. */
  flapTransitions?: number
}

function leadingCount(statuses: readonly CheckStatus[], match: (s: CheckStatus) => boolean): number {
  let n = 0
  for (const s of statuses) {
    if (!match(s)) break
    n += 1
  }
  return n
}

function countTransitions(statuses: readonly CheckStatus[]): number {
  let n = 0
  for (let i = 0; i < statuses.length - 1; i++) if (statuses[i] !== statuses[i + 1]) n += 1
  return n
}

/**
 * Decides whether the latest check warrants a down / up / degraded / flapping notification.
 * Unlike a plain previous→current edge, a state change has to persist for the configured number
 * of consecutive checks first, an `up` is only sent to close a `down` that was actually sent, and
 * a site changing state too often gets one `flapping` alert instead of a down/up pair per blip.
 *
 * @param recent  statuses of the latest checks, newest first, including the one just recorded
 * @param alerted the status last alerted about; null (never alerted) is treated as healthy
 */
export function evaluateStatusAlert(
  recent: readonly CheckStatus[],
  alerted: AlertedStatus | null,
  cfg: StatusAlertConfig,
): StatusAlertDecision {
  const current = recent[0]
  const baseline: AlertedStatus = alerted ?? 'up'
  if (!current) return { emit: null, nextAlerted: baseline }

  const transitions = countTransitions(recent.slice(0, cfg.flap.window))
  if (transitions >= cfg.flap.transitions) {
    return baseline === 'flapping'
      ? { emit: null, nextAlerted: 'flapping' }
      : { emit: 'flapping', nextAlerted: 'flapping', flapTransitions: transitions }
  }

  const held = baseline === 'down' || baseline === 'flapping'

  if (current === 'down') {
    const streak = leadingCount(recent, (s) => s === 'down')
    if (baseline !== 'down' && streak >= cfg.downConfirmations) return { emit: 'down', nextAlerted: 'down' }
    return { emit: null, nextAlerted: baseline }
  }

  if (held) {
    // Recovery. Out of `down` an `up` closes the alert we sent; out of `flapping` it says the site
    // has settled. Either way the streak of non-down checks has to be long enough.
    const streak = leadingCount(recent, (s) => s !== 'down')
    if (streak >= cfg.recoveryConfirmations) return { emit: 'up', nextAlerted: current }
    return { emit: null, nextAlerted: baseline }
  }

  if (current === 'degraded') {
    const streak = leadingCount(recent, (s) => s === 'degraded')
    if (baseline === 'up' && streak >= cfg.degradedConfirmations) return { emit: 'degraded', nextAlerted: 'degraded' }
    return { emit: null, nextAlerted: baseline }
  }

  // Healthy again after a degraded alert: reset silently so a later slowdown can alert afresh.
  return { emit: null, nextAlerted: 'up' }
}
