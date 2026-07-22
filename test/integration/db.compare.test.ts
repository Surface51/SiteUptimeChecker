import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import {
  buildComparison,
  getDb,
  getIncidentStats,
  getPhaseAverages,
  getResponseStats,
} from '../../server/utils/db'

beforeEach(resetDb)

/** Same rationale as db.uptime.test.ts: insertCheck() always stamps "now", so write
 * rows directly to control checked_at (and, here, the individual phase timings). */
function rawInsertCheck(
  siteId: number,
  checkedAt: string,
  overrides: {
    timeTotal?: number | null
    timeDns?: number | null
    timeTcp?: number | null
    timeTls?: number | null
    timeTtfb?: number | null
  } = {},
) {
  getDb()
    .prepare(
      `INSERT INTO checks (site_id, status, checked_at, time_total, time_dns, time_tcp, time_tls, time_ttfb)
       VALUES (?, 'up', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      siteId,
      checkedAt,
      overrides.timeTotal ?? null,
      overrides.timeDns ?? null,
      overrides.timeTcp ?? null,
      overrides.timeTls ?? null,
      overrides.timeTtfb ?? null,
    )
}

function rawInsertIncident(siteId: number, startedAt: string, endedAt: string) {
  getDb()
    .prepare('INSERT INTO incidents (site_id, started_at, ended_at, cause) VALUES (?, ?, ?, ?)')
    .run(siteId, startedAt, endedAt, 'outage')
}

describe('getResponseStats', () => {
  it('returns nulls and zero count when there are no checks with a response time', () => {
    const site = makeSite()
    expect(getResponseStats(site.id, 24)).toEqual({ avgMs: null, p95Ms: null, count: 0 })
  })

  it('computes avg and p95 over the requested window', () => {
    const site = makeSite()
    for (let i = 1; i <= 20; i++) {
      rawInsertCheck(site.id, `2026-01-01 00:${String(i).padStart(2, '0')}:00`, { timeTotal: i * 10 })
    }
    const stats = getResponseStats(site.id, 24 * 365)
    expect(stats.count).toBe(20)
    expect(stats.avgMs).toBe(105)
    expect(stats.p95Ms).toBe(190)
  })

  it('ignores checks with a null time_total and checks outside the window', () => {
    const site = makeSite()
    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    rawInsertCheck(site.id, twoDaysAgo, { timeTotal: 999 })
    rawInsertCheck(site.id, new Date().toISOString().slice(0, 19).replace('T', ' '), { timeTotal: null })
    rawInsertCheck(site.id, new Date().toISOString().slice(0, 19).replace('T', ' '), { timeTotal: 100 })
    expect(getResponseStats(site.id, 24)).toEqual({ avgMs: 100, p95Ms: 100, count: 1 })
  })
})

describe('getPhaseAverages', () => {
  it('returns all nulls when there are no checks', () => {
    const site = makeSite()
    expect(getPhaseAverages(site.id, 24)).toEqual({ dns: null, tcp: null, tls: null, ttfb: null })
  })

  it('averages each phase column independently, ignoring per-row nulls', () => {
    const site = makeSite()
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
    rawInsertCheck(site.id, now, { timeDns: 10, timeTcp: 30, timeTls: 60, timeTtfb: 100 })
    rawInsertCheck(site.id, now, { timeDns: 20, timeTcp: 40, timeTls: null, timeTtfb: 120 })
    const phases = getPhaseAverages(site.id, 24)
    expect(phases.dns).toBe(15)
    expect(phases.tcp).toBe(35)
    expect(phases.tls).toBe(60) // only one non-null sample
    expect(phases.ttfb).toBe(110)
  })
})

describe('getIncidentStats', () => {
  it('returns zero count and downtime when there are no incidents', () => {
    const site = makeSite()
    expect(getIncidentStats(site.id, 24)).toEqual({ count: 0, totalDownSeconds: 0 })
  })

  it('counts incidents started within the window and sums their durations', () => {
    const site = makeSite()
    const now = new Date()
    const recentStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    const recentEnd = now.toISOString().slice(0, 19).replace('T', ' ')
    rawInsertIncident(site.id, recentStart, recentEnd) // ~3600s, within the last 24h

    const oldStart = new Date(now.getTime() - 3 * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    const oldEnd = new Date(now.getTime() - 3 * 86400 * 1000 + 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    rawInsertIncident(site.id, oldStart, oldEnd) // outside the 24h window

    const stats = getIncidentStats(site.id, 24)
    expect(stats.count).toBe(1)
    expect(stats.totalDownSeconds).toBeGreaterThanOrEqual(3599)
    expect(stats.totalDownSeconds).toBeLessThanOrEqual(3601)
  })
})

describe('buildComparison', () => {
  it('skips ids that do not resolve to an existing site', () => {
    const site = makeSite()
    const rows = buildComparison([site.id, 999999], 24)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.site.id).toBe(site.id)
  })

  it('assembles the full comparison shape for each site', () => {
    const siteA = makeSite({ name: 'Site A' })
    const siteB = makeSite({ name: 'Site B' })
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
    rawInsertCheck(siteA.id, now, { timeTotal: 100 })
    rawInsertCheck(siteB.id, now, { timeTotal: 200 })

    const rows = buildComparison([siteA.id, siteB.id], 24)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.site.name)).toEqual(['Site A', 'Site B'])
    expect(rows[0]!.avgMs).toBe(100)
    expect(rows[1]!.avgMs).toBe(200)
    for (const row of rows) {
      expect(row).toHaveProperty('uptime24h')
      expect(row).toHaveProperty('uptime7d')
      expect(row).toHaveProperty('uptime30d')
      expect(row).toHaveProperty('phases')
      expect(row).toHaveProperty('incidents')
      expect(row).toHaveProperty('sslDaysRemaining')
      expect(row).toHaveProperty('lighthouse')
      expect(row).toHaveProperty('series')
    }
  })
})
