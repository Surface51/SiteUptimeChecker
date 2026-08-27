import { beforeEach, describe, expect, it } from 'vitest'
import { getSite, updateSite } from '../../server/utils/db'
import { normalizeLogSlug } from '../../server/utils/logs/slug'
import { makeSite, resetDb } from '../helpers/db'

beforeEach(() => {
  resetDb()
})

describe('sites.log_slug', () => {
  it('defaults to null for a site created without one', () => {
    const site = makeSite()
    expect(site.logSlug).toBeNull()
  })

  it('round-trips a slug through insert and read', () => {
    const site = makeSite({ logSlug: 'marchingillini' })
    expect(site.logSlug).toBe('marchingillini')
    expect(getSite(site.id)!.logSlug).toBe('marchingillini')
  })

  it('links and unlinks via updateSite', () => {
    const site = makeSite()

    expect(updateSite(site.id, { logSlug: 'pixna' })!.logSlug).toBe('pixna')
    expect(updateSite(site.id, { logSlug: null })!.logSlug).toBeNull()
  })

  it('leaves the slug alone when a patch does not mention it', () => {
    const site = makeSite({ logSlug: 'pixna' })

    const updated = updateSite(site.id, { name: 'Renamed' })!
    expect(updated.name).toBe('Renamed')
    expect(updated.logSlug).toBe('pixna')
  })
})

describe('normalizeLogSlug', () => {
  it('treats blank input as unlinked', () => {
    expect(normalizeLogSlug('')).toBeNull()
    expect(normalizeLogSlug('   ')).toBeNull()
    expect(normalizeLogSlug(null)).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeLogSlug('  acme  ')).toBe('acme')
  })

  it('accepts ordinary folder names', () => {
    expect(normalizeLogSlug('charles-ives')).toBe('charles-ives')
    expect(normalizeLogSlug('site_2.prod')).toBe('site_2.prod')
  })

  it('rejects anything that could escape the ingress directory', () => {
    // The slug is joined onto a filesystem path, so traversal and separators must not survive.
    for (const bad of ['..', '../etc', 'a/b', 'a\\b', '/abs', '.hidden', 'a b', 'a;b']) {
      expect(normalizeLogSlug(bad), bad).toBeUndefined()
    }
  })
})
