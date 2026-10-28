import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import { getDb, getFleetTrends, getSite, updateSite } from '../../server/utils/db'

beforeEach(resetDb)

function rawCheck(siteId: number, status: string, daysAgo: number) {
  getDb()
    .prepare(`INSERT INTO checks (site_id, status, checked_at, time_total) VALUES (?, ?, datetime('now', ?), 100)`)
    .run(siteId, status, `-${daysAgo} days`)
}

function rawIncident(siteId: number, daysAgo: number, durationMinutes: number | null) {
  getDb()
    .prepare(
      `INSERT INTO incidents (site_id, started_at, ended_at)
       VALUES (?, datetime('now', ?), CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', ?, ?) END)`,
    )
    .run(siteId, `-${daysAgo} days`, durationMinutes, `-${daysAgo} days`, `+${durationMinutes ?? 0} minutes`)
}

describe('getFleetTrends', () => {
  it('returns a zero-filled series of the requested length when there are no sites', () => {
    const t = getFleetTrends(7)
    expect(t.series).toHaveLength(7)
    expect(t.series.every((d) => d.uptime === null && d.incidents === 0)).toBe(true)
    expect(t.current.uptime).toBeNull()
    expect(t.previous.incidents).toBe(0)
  })

  it('weights uptime by check count rather than averaging per-site percentages', () => {
    const busy = makeSite()
    const quiet = makeSite()
    for (let i = 0; i < 9; i++) rawCheck(busy.id, 'up', 0)
    rawCheck(busy.id, 'down', 0) // busy: 90% over 10 checks
    rawCheck(quiet.id, 'up', 0) // quiet: 100% over 1 check

    const t = getFleetTrends(7)
    const today = t.series[t.series.length - 1]!
    expect(today.total).toBe(11)
    expect(today.uptime).toBeCloseTo((100 * 10) / 11, 5) // 90.909, not the 95 a mean-of-means gives
    expect(t.current.uptime).toBeCloseTo((100 * 10) / 11, 5)
  })

  it('keeps the previous window separate from the current one', () => {
    const site = makeSite()
    rawCheck(site.id, 'up', 1) // current window
    rawCheck(site.id, 'down', 9) // previous window (7d)

    const t = getFleetTrends(7)
    expect(t.current.uptime).toBe(100)
    expect(t.previous.uptime).toBe(0)
  })

  it('buckets incidents by start day and splits MTTR by window', () => {
    const site = makeSite()
    rawIncident(site.id, 1, 10) // current, 10 min
    rawIncident(site.id, 1, 20) // current, 20 min
    rawIncident(site.id, 2, null) // current, still open
    rawIncident(site.id, 10, 60) // previous

    const t = getFleetTrends(7)
    expect(t.current.incidents).toBe(3)
    expect(t.current.mttrSeconds).toBe(15 * 60)
    expect(t.previous.incidents).toBe(1)
    expect(t.previous.mttrSeconds).toBe(60 * 60)
    expect(t.series.reduce((sum, d) => sum + d.incidents, 0)).toBe(3)
  })

  it('ignores paused sites', () => {
    const site = makeSite()
    rawCheck(site.id, 'down', 0)
    rawIncident(site.id, 0, 5)
    updateSite(site.id, { enabled: false })

    const t = getFleetTrends(7)
    expect(t.current.uptime).toBeNull()
    expect(t.current.incidents).toBe(0)
  })
})

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
