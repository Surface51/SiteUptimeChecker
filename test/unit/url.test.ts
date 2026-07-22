import { describe, expect, it } from 'vitest'
import { normalizeSiteUrl } from '../../server/utils/url'

describe('normalizeSiteUrl', () => {
  it('adds https:// when no scheme is given', () => {
    expect(normalizeSiteUrl('example.com')).toBe('https://example.com/')
  })

  it('preserves an explicit http:// scheme', () => {
    expect(normalizeSiteUrl('http://example.com')).toBe('http://example.com/')
  })

  it('preserves an explicit https:// scheme', () => {
    expect(normalizeSiteUrl('https://example.com')).toBe('https://example.com/')
  })

  it('is case-insensitive when detecting an existing scheme', () => {
    expect(normalizeSiteUrl('HTTPS://example.com')).toBe('https://example.com/')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeSiteUrl('  example.com  ')).toBe('https://example.com/')
  })

  it('preserves path, query, and port', () => {
    expect(normalizeSiteUrl('example.com:8080/health?x=1')).toBe('https://example.com:8080/health?x=1')
  })

  it('throws on input that cannot form a valid URL', () => {
    expect(() => normalizeSiteUrl('not a url')).toThrow()
  })

  it('throws on empty input', () => {
    expect(() => normalizeSiteUrl('')).toThrow()
  })
})
