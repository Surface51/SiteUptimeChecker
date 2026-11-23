import { describe, expect, it } from 'vitest'
import { parseSiteSettings } from '../../../server/utils/siteSettings'

describe('parseSiteSettings seoEnabled', () => {
  it('defaults to on when a create request omits it', () => {
    expect(parseSiteSettings({ url: 'https://example.test/' }, { partial: false }).seoEnabled).toBe(true)
  })

  it('honours an explicit false, and leaves it untouched on a partial update that omits it', () => {
    expect(parseSiteSettings({ url: 'https://example.test/', seoEnabled: false }, { partial: false }).seoEnabled).toBe(false)
    expect('seoEnabled' in parseSiteSettings({ name: 'x' }, { partial: true })).toBe(false)
  })
})
