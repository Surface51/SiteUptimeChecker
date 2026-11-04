import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import { addSiteTag, backfillTaxonomyFromTags, getDb, getSite, getTagsForSite, listAllTagNames, updateSite } from '../../server/utils/db'
import { parseSiteSettings } from '../../server/utils/siteSettings'

beforeEach(resetDb)

describe('hosting / platform', () => {
  it('stores and returns them', () => {
    const site = makeSite({ url: 'https://a.test/' })
    expect(site.hosting).toBeNull()
    updateSite(site.id, { hosting: 'Pantheon', platform: 'Drupal' })
    expect(getSite(site.id)).toMatchObject({ hosting: 'Pantheon', platform: 'Drupal' })
  })

  it('backfills from tags, removing only the taxonomy tags', () => {
    const a = makeSite({ url: 'https://a.test/' })
    const b = makeSite({ url: 'https://b.test/' })
    for (const t of ['pantheon', 'WordPress', 'Other']) addSiteTag(a.id, t)
    addSiteTag(b.id, 'digital ocean')

    backfillTaxonomyFromTags(getDb())

    expect(getSite(a.id)).toMatchObject({ hosting: 'Pantheon', platform: 'WordPress', tags: ['Other'] })
    expect(getSite(b.id)).toMatchObject({ hosting: 'Digital Ocean', platform: null })
    expect(getTagsForSite(b.id)).toEqual([])
    expect(listAllTagNames()).toEqual(['Other'])
  })
})

describe('parseSiteSettings taxonomy', () => {
  it('normalizes case and clears empties', () => {
    expect(parseSiteSettings({ hosting: 'cpanel', platform: '' }, { partial: true })).toEqual({
      hosting: 'CPanel',
      platform: null,
    })
  })

  it('rejects unknown values', () => {
    expect(() => parseSiteSettings({ hosting: 'Heroku' }, { partial: true })).toThrow()
    expect(() => parseSiteSettings({ platform: 'Rails' }, { partial: true })).toThrow()
  })
})
