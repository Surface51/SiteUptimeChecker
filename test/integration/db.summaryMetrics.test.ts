import { beforeEach, describe, expect, it } from 'vitest'
import { makeCheckInput, makeSite, resetDb } from '../helpers/db'
import { buildSiteSummary, getDb, getIncidentSummary, insertCheck, insertWhoisRecord } from '../../server/utils/db'

beforeEach(resetDb)

function rawIncident(siteId: number, startedAt: string, endedAt: string | null) {
  getDb()
    .prepare('INSERT INTO incidents (site_id, started_at, ended_at) VALUES (?, ?, ?)')
    .run(siteId, startedAt, endedAt)
}

/** "now" as the app stores it. */
function sqlNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 19).replace('T', ' ')
}

describe('getIncidentSummary', () => {
  it('sums recovery time over closed incidents and excludes the still-open one', () => {
    const site = makeSite()
    rawIncident(site.id, sqlNow(-5 * 3600_000), sqlNow(-4 * 3600_000)) // 1h to recover
    rawIncident(site.id, sqlNow(-3 * 3600_000), sqlNow(-1 * 3600_000)) // 2h to recover
    rawIncident(site.id, sqlNow(-30 * 60_000), null) // still open

    const summary = getIncidentSummary(site.id, 24)
    expect(summary.total).toBe(3)
    expect(summary.closed).toBe(2)
    expect(summary.recoverySeconds).toBeGreaterThanOrEqual(3 * 3600 - 5)
    expect(summary.recoverySeconds).toBeLessThanOrEqual(3 * 3600 + 5)
  })

  it('returns zeros when nothing started in the window', () => {
    const site = makeSite()
    expect(getIncidentSummary(site.id, 24)).toEqual({ total: 0, closed: 0, recoverySeconds: 0 })
  })

  it('ignores incidents that started outside the trailing window', () => {
    const site = makeSite()
    rawIncident(site.id, sqlNow(-48 * 3600_000), sqlNow(-47 * 3600_000))
    expect(getIncidentSummary(site.id, 24)).toEqual({ total: 0, closed: 0, recoverySeconds: 0 })
  })
})

describe('buildSiteSummary', () => {
  it('carries 24h response stats, 30d incident recovery, and domain expiry', () => {
    const site = makeSite()
    insertCheck(makeCheckInput(site.id, 'up', { timeTotal: 100 }))
    insertCheck(makeCheckInput(site.id, 'up', { timeTotal: 300 }))
    rawIncident(site.id, sqlNow(-2 * 3600_000), sqlNow(-1 * 3600_000))
    insertWhoisRecord({
      siteId: site.id,
      registrar: 'Example Registrar',
      createdDate: null,
      updatedDate: null,
      expiryDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      nameServers: [],
      statuses: [],
      raw: null,
      error: null,
    })

    const summary = buildSiteSummary(site)
    expect(summary.checkCount24h).toBe(2)
    expect(summary.avgMs24h).toBe(200)
    expect(summary.incidents30d.total).toBe(1)
    expect(summary.incidents30d.closed).toBe(1)
    expect(summary.incidents30d.recoverySeconds).toBeGreaterThanOrEqual(3600 - 5)
    expect(summary.domainExpiresAt).not.toBeNull()
    expect(summary.domainDaysRemaining).toBeGreaterThanOrEqual(9)
    expect(summary.domainDaysRemaining).toBeLessThanOrEqual(10)
  })

  it('defaults to nulls/zeros when there is no history', () => {
    const site = makeSite()
    const summary = buildSiteSummary(site)
    expect(summary.avgMs24h).toBeNull()
    expect(summary.p95Ms24h).toBeNull()
    expect(summary.checkCount24h).toBe(0)
    expect(summary.incidents30d).toEqual({ total: 0, closed: 0, recoverySeconds: 0 })
    expect(summary.domainExpiresAt).toBeNull()
    expect(summary.domainDaysRemaining).toBeNull()
  })
})
