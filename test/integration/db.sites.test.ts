import { beforeEach, describe, expect, it } from 'vitest'
import { makeCheckInput, makeSite, resetDb } from '../helpers/db'
import { deleteSite, getDb, getLatestCheck, getSite, getSiteByUrl, insertCheck, updateSite } from '../../server/utils/db'

beforeEach(resetDb)

/**
 * insertCheck() stamps checked_at as "now" (1-second SQLite resolution), so two
 * calls in the same test can tie on checked_at with no defined ordering. Write a
 * row directly with an explicit timestamp when a test needs deterministic ordering.
 */
function rawInsertCheck(siteId: number, status: string, checkedAt: string) {
  return getDb()
    .prepare('INSERT INTO checks (site_id, status, checked_at) VALUES (?, ?, ?)')
    .run(siteId, status, checkedAt).lastInsertRowid as number
}

describe('sites', () => {
  it('inserts a site with defaults and reads it back', () => {
    const site = makeSite({ url: 'https://a.test/', name: 'A' })
    expect(site.id).toBeGreaterThan(0)
    expect(site.url).toBe('https://a.test/')
    expect(site.name).toBe('A')
    expect(site.enabled).toBe(true)
    expect(site.degradedMs).toBe(5000)
    expect(site.expectedStatus).toBeNull()
  })

  it('looks a site up by id and by url', () => {
    const site = makeSite({ url: 'https://b.test/' })
    expect(getSite(site.id)?.url).toBe('https://b.test/')
    expect(getSiteByUrl('https://b.test/')?.id).toBe(site.id)
  })

  it('returns null for a missing site', () => {
    expect(getSite(999999)).toBeNull()
    expect(getSiteByUrl('https://nope.test/')).toBeNull()
  })

  it('updates only the provided fields, preserving the rest', () => {
    const site = makeSite({ url: 'https://c.test/', name: 'C', checkIntervalSeconds: 60 })
    const updated = updateSite(site.id, { name: 'C2' })
    expect(updated?.name).toBe('C2')
    expect(updated?.url).toBe('https://c.test/')
    expect(updated?.checkIntervalSeconds).toBe(60)
  })

  it('deletes a site', () => {
    const site = makeSite()
    deleteSite(site.id)
    expect(getSite(site.id)).toBeNull()
  })

  it('cascades check deletion when a site is deleted', () => {
    const site = makeSite()
    insertCheck(makeCheckInput(site.id, 'up'))
    deleteSite(site.id)
    expect(getLatestCheck(site.id)).toBeNull()
  })
})

describe('checks', () => {
  it('getLatestCheck returns the most recently inserted check for that site', () => {
    const site = makeSite()
    rawInsertCheck(site.id, 'down', '2026-01-01 00:00:00')
    const latestId = rawInsertCheck(site.id, 'up', '2026-01-01 00:01:00')
    expect(getLatestCheck(site.id)?.id).toBe(latestId)
    expect(getLatestCheck(site.id)?.status).toBe('up')
  })

  it('keeps checks scoped to their own site', () => {
    const siteA = makeSite()
    const siteB = makeSite()
    insertCheck(makeCheckInput(siteA.id, 'up'))
    expect(getLatestCheck(siteB.id)).toBeNull()
  })
})
