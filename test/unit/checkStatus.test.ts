import { describe, expect, it } from 'vitest'
import { determineStatus, type DetermineStatusInput } from '../../server/utils/checks/status'

const base: DetermineStatusInput = {
  expectedStatus: null,
  httpStatus: 200,
  error: null,
  timeTotal: 100,
  degradedMs: 5000,
  sslDaysRemaining: null,
}

describe('determineStatus', () => {
  describe('expectedStatus set', () => {
    it('is up when httpStatus matches expectedStatus', () => {
      expect(determineStatus({ ...base, expectedStatus: 404, httpStatus: 404 })).toBe('up')
    })

    it('is down when httpStatus does not match expectedStatus, even if 2xx', () => {
      expect(determineStatus({ ...base, expectedStatus: 404, httpStatus: 200 })).toBe('down')
    })

    it('is down when there is no httpStatus at all', () => {
      expect(determineStatus({ ...base, expectedStatus: 200, httpStatus: null, error: 'timeout' })).toBe(
        'down',
      )
    })
  })

  describe('no expectedStatus (default heuristic)', () => {
    it('is down on a request error', () => {
      expect(determineStatus({ ...base, httpStatus: null, error: 'ECONNREFUSED' })).toBe('down')
    })

    it('is down when httpStatus is null', () => {
      expect(determineStatus({ ...base, httpStatus: null })).toBe('down')
    })

    it('is down on a 4xx status', () => {
      expect(determineStatus({ ...base, httpStatus: 404 })).toBe('down')
    })

    it('is down on a 5xx status', () => {
      expect(determineStatus({ ...base, httpStatus: 500 })).toBe('down')
    })

    it('is up on a 2xx status', () => {
      expect(determineStatus({ ...base, httpStatus: 200 })).toBe('up')
    })

    it('is up on a 3xx status (redirects are followed upstream, so a bare 3xx here is fine)', () => {
      expect(determineStatus({ ...base, httpStatus: 301 })).toBe('up')
    })
  })

  describe('degraded downgrade', () => {
    it('degrades an up status when timeTotal exceeds degradedMs', () => {
      expect(determineStatus({ ...base, timeTotal: 5001, degradedMs: 5000 })).toBe('degraded')
    })

    it('does not degrade when timeTotal equals degradedMs exactly', () => {
      expect(determineStatus({ ...base, timeTotal: 5000, degradedMs: 5000 })).toBe('up')
    })

    it('degrades an up status when SSL is near expiry', () => {
      expect(determineStatus({ ...base, sslDaysRemaining: 6 })).toBe('degraded')
    })

    it('does not degrade at exactly the SSL warning threshold', () => {
      expect(determineStatus({ ...base, sslDaysRemaining: 7 })).toBe('up')
    })

    it('does not degrade a down status even if slow or SSL is expiring', () => {
      expect(determineStatus({ ...base, httpStatus: 500, timeTotal: 999999, sslDaysRemaining: 1 })).toBe(
        'down',
      )
    })

    it('ignores a null timeTotal for the slowness check', () => {
      expect(determineStatus({ ...base, timeTotal: null })).toBe('up')
    })
  })
})
