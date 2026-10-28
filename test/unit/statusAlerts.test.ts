import { describe, expect, it } from 'vitest'
import { evaluateStatusAlert, type StatusAlertConfig } from '../../server/utils/statusAlerts'
import type { CheckStatus } from '../../shared/types'

const cfg: StatusAlertConfig = {
  downConfirmations: 2,
  recoveryConfirmations: 1,
  degradedConfirmations: 3,
  flap: { window: 10, transitions: 4 },
}

// Newest first, like getRecentStatuses.
const recent = (...s: CheckStatus[]) => s

describe('evaluateStatusAlert', () => {
  it('waits for the configured number of down checks', () => {
    expect(evaluateStatusAlert(recent('down', 'up'), 'up', cfg).emit).toBeNull()
    expect(evaluateStatusAlert(recent('down', 'down', 'up'), 'up', cfg)).toMatchObject({ emit: 'down', nextAlerted: 'down' })
  })

  it('treats a never-alerted site as healthy', () => {
    expect(evaluateStatusAlert(recent('down', 'down'), null, cfg).emit).toBe('down')
    expect(evaluateStatusAlert(recent('up'), null, cfg)).toEqual({ emit: null, nextAlerted: 'up' })
  })

  it('does not repeat a down alert', () => {
    expect(evaluateStatusAlert(recent('down', 'down', 'down'), 'down', cfg)).toEqual({ emit: null, nextAlerted: 'down' })
  })

  it('only sends "up" to close an alerted down', () => {
    expect(evaluateStatusAlert(recent('up', 'down', 'down'), 'down', cfg)).toMatchObject({ emit: 'up', nextAlerted: 'up' })
    expect(evaluateStatusAlert(recent('up', 'down', 'up'), 'up', cfg).emit).toBeNull()
  })

  it('waits for recoveryConfirmations non-down checks', () => {
    const slow = { ...cfg, recoveryConfirmations: 2 }
    expect(evaluateStatusAlert(recent('up', 'down', 'down'), 'down', slow).emit).toBeNull()
    expect(evaluateStatusAlert(recent('up', 'up', 'down', 'down'), 'down', slow).emit).toBe('up')
  })

  it('needs consecutive degraded checks, and alerts once', () => {
    expect(evaluateStatusAlert(recent('degraded', 'degraded', 'up'), 'up', cfg).emit).toBeNull()
    expect(evaluateStatusAlert(recent('degraded', 'degraded', 'degraded'), 'up', cfg)).toMatchObject({ emit: 'degraded' })
    expect(evaluateStatusAlert(recent('degraded', 'degraded', 'degraded', 'degraded'), 'degraded', cfg).emit).toBeNull()
  })

  it('resets silently from degraded to up so a later slowdown can alert again', () => {
    expect(evaluateStatusAlert(recent('up', 'degraded'), 'degraded', cfg)).toEqual({ emit: null, nextAlerted: 'up' })
  })

  it('raises flapping once and then holds back down/up', () => {
    const flappy = recent('up', 'down', 'up', 'down', 'up')
    expect(evaluateStatusAlert(flappy, 'up', cfg)).toMatchObject({ emit: 'flapping', nextAlerted: 'flapping', flapTransitions: 4 })
    expect(evaluateStatusAlert(recent('down', ...flappy), 'flapping', cfg)).toEqual({ emit: null, nextAlerted: 'flapping' })
  })

  it('recovers from flapping with "up" once the window calms down', () => {
    const calm = recent('up', 'up', 'up', 'up', 'up', 'up', 'up', 'down', 'up', 'down')
    expect(evaluateStatusAlert(calm, 'flapping', cfg)).toMatchObject({ emit: 'up', nextAlerted: 'up' })
  })

  it('has nothing to say without checks', () => {
    expect(evaluateStatusAlert([], 'down', cfg)).toEqual({ emit: null, nextAlerted: 'down' })
  })
})
