import { describe, expect, it } from 'vitest'
import { evaluateSecurityHeaders } from '../../server/utils/checks/securityHeaders'

describe('evaluateSecurityHeaders', () => {
  it('reports maxScore of 7 regardless of input', () => {
    expect(evaluateSecurityHeaders({}).maxScore).toBe(7)
  })

  it('scores 0 and marks every header absent when none are present', () => {
    const report = evaluateSecurityHeaders({})
    expect(report.score).toBe(0)
    expect(report.headers['strict-transport-security']).toEqual({ present: false, value: null })
    expect(report.headers['content-security-policy']).toEqual({ present: false, value: null })
  })

  it('matches header names case-insensitively', () => {
    const report = evaluateSecurityHeaders({ 'Strict-Transport-Security': 'max-age=63072000' })
    expect(report.headers['strict-transport-security']).toEqual({
      present: true,
      value: 'max-age=63072000',
    })
    expect(report.score).toBe(1)
  })

  it('counts every checked header that is present', () => {
    const report = evaluateSecurityHeaders({
      'strict-transport-security': 'max-age=1',
      'content-security-policy': "default-src 'self'",
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'geolocation=()',
      'cross-origin-opener-policy': 'same-origin',
    })
    expect(report.score).toBe(7)
    expect(report.score).toBe(report.maxScore)
  })

  it('ignores headers outside the checked list', () => {
    const report = evaluateSecurityHeaders({ 'x-powered-by': 'Express' })
    expect(report.score).toBe(0)
    expect(report.headers['x-powered-by']).toBeUndefined()
  })
})
