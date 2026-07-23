import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import { addSiteTag, deleteSite, getSite, listAllTagNames, removeSiteTag } from '../../server/utils/db'

beforeEach(resetDb)

describe('site tags', () => {
  it('has no tags by default', () => {
    const site = makeSite()
    expect(site.tags).toEqual([])
  })

  it('adds a tag and reflects it on the site', () => {
    const site = makeSite()
    const tags = addSiteTag(site.id, 'prod')
    expect(tags).toEqual(['prod'])
    expect(getSite(site.id)!.tags).toEqual(['prod'])
  })

  it('is idempotent when adding the same tag twice', () => {
    const site = makeSite()
    addSiteTag(site.id, 'prod')
    const tags = addSiteTag(site.id, 'prod')
    expect(tags).toEqual(['prod'])
  })

  it('treats tag names case-insensitively, reusing the first casing seen', () => {
    const siteA = makeSite()
    const siteB = makeSite()
    addSiteTag(siteA.id, 'Prod')
    const tagsB = addSiteTag(siteB.id, 'PROD')
    expect(tagsB).toEqual(['Prod'])
    expect(listAllTagNames()).toEqual(['Prod'])
  })

  it('sorts a site\'s tags alphabetically, case-insensitively', () => {
    const site = makeSite()
    addSiteTag(site.id, 'zeta')
    addSiteTag(site.id, 'Alpha')
    expect(getSite(site.id)!.tags).toEqual(['Alpha', 'zeta'])
  })

  it('removes a tag from a site', () => {
    const site = makeSite()
    addSiteTag(site.id, 'prod')
    const tags = removeSiteTag(site.id, 'prod')
    expect(tags).toEqual([])
    expect(getSite(site.id)!.tags).toEqual([])
  })

  it('removing a tag is a no-op if the site does not have it', () => {
    const site = makeSite()
    const tags = removeSiteTag(site.id, 'nope')
    expect(tags).toEqual([])
  })

  it('drops orphaned tags from the global list once no site references them', () => {
    const site = makeSite()
    addSiteTag(site.id, 'temp')
    expect(listAllTagNames()).toEqual(['temp'])
    removeSiteTag(site.id, 'temp')
    expect(listAllTagNames()).toEqual([])
  })

  it('keeps a tag in the global list if another site still references it', () => {
    const siteA = makeSite()
    const siteB = makeSite()
    addSiteTag(siteA.id, 'shared')
    addSiteTag(siteB.id, 'shared')
    removeSiteTag(siteA.id, 'shared')
    expect(listAllTagNames()).toEqual(['shared'])
    expect(getSite(siteB.id)!.tags).toEqual(['shared'])
  })

  it('scopes tags to their own site', () => {
    const siteA = makeSite()
    const siteB = makeSite()
    addSiteTag(siteA.id, 'a-only')
    expect(getSite(siteA.id)!.tags).toEqual(['a-only'])
    expect(getSite(siteB.id)!.tags).toEqual([])
  })

  it('removes tags when the site is deleted', () => {
    const site = makeSite()
    addSiteTag(site.id, 'prod')
    deleteSite(site.id)
    expect(listAllTagNames()).toEqual([])
  })
})
