import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import { getDb, getIncidentMetrics, getSlaReport, updateSite } from '../../server/utils/db'

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

describe('getSlaReport', () => {
  it('returns null when the site has no SLA target', () => {
    const site = makeSite()
    expect(getSlaReport(site.id)).toBeNull()
  })

  it('computes achieved uptime and budget use from time-weighted downtime', () => {
    const site = makeSite()
    updateSite(site.id, { slaTarget: 99 })

    // One closed 2-hour incident earlier today.
    rawIncident(site.id, sqlNow(-4 * 3600_000), sqlNow(-2 * 3600_000))

    const report = getSlaReport(site.id)!
    expect(report.target).toBe(99)
    expect(report.downSeconds).toBeGreaterThanOrEqual(2 * 3600 - 5)
    expect(report.downSeconds).toBeLessThanOrEqual(2 * 3600 + 5)
    // elapsed this month is well over the 2h of downtime, so achieved is high but < 100.
    expect(report.achievedPct).toBeLessThan(100)
    expect(report.achievedPct).toBeGreaterThan(90)
    // allowed = elapsed * 1% ; used = down / allowed
    expect(report.budgetUsedPct).toBeCloseTo((100 * report.downSeconds) / report.allowedDownSeconds, 3)
    expect(report.trailing12).toHaveLength(12)
  })

  it('elapsed runs to now for the current month, not month end', () => {
    const site = makeSite()
    updateSite(site.id, { slaTarget: 99.9 })
    const report = getSlaReport(site.id)!
    const now = Date.now()
    const monthStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
    expect(report.elapsedSeconds).toBeCloseTo((now - monthStart) / 1000, -2)
  })
})

describe('getIncidentMetrics', () => {
  it('reports count, MTTR over closed incidents and MTBF between starts', () => {
    const site = makeSite()
    const base = Date.UTC(2026, 0, 1)
    const at = (h: number) => new Date(base + h * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
    rawIncident(site.id, at(0), at(1)) // 1h to recover
    rawIncident(site.id, at(10), at(13)) // 3h to recover
    rawIncident(site.id, at(20), null) // still open

    const m = getIncidentMetrics(site.id, base, base + 30 * 3600_000)
    expect(m.count).toBe(3)
    expect(m.mttrSeconds).toBeCloseTo((1 * 3600 + 3 * 3600) / 2, 3) // 2h over the two closed
    expect(m.mtbfSeconds).toBeCloseTo((20 * 3600) / 2, 3) // (0→10→20) two gaps of 10h
  })
})
