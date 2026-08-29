import { describe, expect, it } from 'vitest'
import { evaluateAssertions, hasAnyAssertion, type AssertionConfig } from '../../../server/utils/checks/assertions'

const none: AssertionConfig = { expect: null, forbid: null, regex: null, minBytes: null }

describe('hasAnyAssertion', () => {
  it('is false when nothing is configured', () => {
    expect(hasAnyAssertion(none)).toBe(false)
  })
  it('is true when any field is set', () => {
    expect(hasAnyAssertion({ ...none, expect: 'x' })).toBe(true)
    expect(hasAnyAssertion({ ...none, minBytes: 1 })).toBe(true)
  })
})

describe('evaluateAssertions', () => {
  it('passes when nothing is configured', () => {
    expect(evaluateAssertions('anything', 10, none)).toEqual({ failed: false, detail: null })
  })

  it('passes when the expected text is present', () => {
    expect(evaluateAssertions('<p>Add to cart</p>', 18, { ...none, expect: 'Add to cart' }).failed).toBe(false)
  })

  it('fails, with detail, when the expected text is missing', () => {
    const r = evaluateAssertions('<p>Sold out</p>', 15, { ...none, expect: 'Add to cart' })
    expect(r.failed).toBe(true)
    expect(r.detail).toContain('Add to cart')
  })

  it('fails when forbidden text is present', () => {
    const r = evaluateAssertions('Fatal error: undefined function', 31, { ...none, forbid: 'Fatal error' })
    expect(r.failed).toBe(true)
    expect(r.detail).toContain('Fatal error')
  })

  it('fails a non-matching regex and passes a matching one', () => {
    expect(evaluateAssertions('order #12345', 12, { ...none, regex: 'order #\\d+' }).failed).toBe(false)
    expect(evaluateAssertions('no order here', 13, { ...none, regex: 'order #\\d+' }).failed).toBe(true)
  })

  it('treats an uncompilable regex as unconfigured rather than a failure', () => {
    expect(evaluateAssertions('x', 1, { ...none, regex: '(' }).failed).toBe(false)
  })

  it('fails minBytes using Content-Length when the body is absent', () => {
    const r = evaluateAssertions(null, 40, { ...none, minBytes: 100 })
    expect(r.failed).toBe(true)
    expect(r.detail).toContain('40')
  })

  it('passes minBytes when the response is large enough', () => {
    expect(evaluateAssertions(null, 5000, { ...none, minBytes: 100 }).failed).toBe(false)
  })

  it('fails a text assertion when there is no body to check', () => {
    expect(evaluateAssertions(null, 500, { ...none, expect: 'hello' }).failed).toBe(true)
  })

  it('handles an empty-string body', () => {
    expect(evaluateAssertions('', 0, { ...none, expect: 'hi' }).failed).toBe(true)
    expect(evaluateAssertions('', 0, { ...none, forbid: 'hi' }).failed).toBe(false)
  })
})
