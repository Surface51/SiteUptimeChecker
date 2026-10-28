import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import { getSite, updateSite } from '../../server/utils/db'

beforeEach(resetDb)

describe('pinned sites', () => {
  it('defaults to unpinned and round-trips through updateSite', () => {
    const site = makeSite()
    expect(site.pinned).toBe(false)

    expect(updateSite(site.id, { pinned: true })!.pinned).toBe(true)
    expect(getSite(site.id)!.pinned).toBe(true)
    expect(updateSite(site.id, { pinned: false })!.pinned).toBe(false)
  })

  it('leaves pinned alone when the patch does not mention it', () => {
    const site = makeSite()
    updateSite(site.id, { pinned: true })
    expect(updateSite(site.id, { name: 'Renamed' })!.pinned).toBe(true)
  })
})
