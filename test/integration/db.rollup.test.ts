import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import { getDailyUptime, getDb, getResponseBaselineMs } from '../../server/utils/db'
import { backfillRollups, downSecondsForDay, pruneOldData, rollupDay } from '../../server/utils/rollup'

beforeEach(resetDb)

function rawCheck(siteId: number, status: string, checkedAt: string, timeTotal: number | null = null) {
  getDb()
    .prepare('INSERT INTO checks (site_id, status, checked_at, time_total) VALUES (?, ?, ?, ?)')
    .run(siteId, status, checkedAt, timeTotal)
}

function rawIncident(siteId: number, startedAt: string, endedAt: string | null) {
  getDb()
    .prepare('INSERT INTO incidents (site_id, started_at, ended_at) VALUES (?, ?, ?)')
    .run(siteId, startedAt, endedAt)
}

function dayNDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)
}

describe('rollups & retention', () => {
  it('backfills rollups so getDailyUptime sees data past the raw-check retention window', () => {
    const site = makeSite()
    const day45 = dayNDaysAgo(45)
    rawCheck(site.id, 'up', `${day45} 10:00:00`, 120)
    rawCheck(site.id, 'up', `${day45} 11:00:00`, 140)
    rawCheck(site.id, 'down', `${day45} 12:00:00`)

    backfillRollups()
    pruneOldData() // drops the raw checks older than 30 days

    expect(getDb().prepare('SELECT COUNT(*) AS n FROM checks').get()).toEqual({ n: 0 })

    const daily = getDailyUptime(site.id, 90)
    const bucket = daily.find((d) => d.date === day45)
    expect(bucket).toBeDefined()
    expect(bucket!.total).toBe(3)
    expect(bucket!.uptime).toBeCloseTo((2 / 3) * 100, 5)
    expect(bucket!.p95Ms).not.toBeNull()
  })

  it('rollupDay is idempotent', () => {
    const site = makeSite()
    const day = dayNDaysAgo(3)
    rawCheck(site.id, 'up', `${day} 09:00:00`, 100)
    rollupDay(site.id, day)
    rollupDay(site.id, day)
    const rows = getDb()
      .prepare('SELECT * FROM daily_uptime WHERE site_id = ? AND day = ?')
      .all(site.id, day)
    expect(rows).toHaveLength(1)
  })

  it('clips a downtime interval spanning midnight to each day', () => {
    const site = makeSite()
    const d1 = dayNDaysAgo(10)
    const d2 = dayNDaysAgo(9)
    // Down from 23:00 on d1 to 01:00 on d2 — one hour each side.
    rawIncident(site.id, `${d1} 23:00:00`, `${d2} 01:00:00`)
    expect(downSecondsForDay(site.id, d1)).toBe(3600)
    expect(downSecondsForDay(site.id, d2)).toBe(3600)
  })

  it('an open incident contributes downtime up to now on the current day', () => {
    const site = makeSite()
    const today = new Date().toISOString().slice(0, 10)
    const startedAt = new Date(Date.now() - 5 * 60_000).toISOString().slice(0, 19).replace('T', ' ')
    rawIncident(site.id, startedAt, null)
    const secs = downSecondsForDay(site.id, today)
    expect(secs).toBeGreaterThanOrEqual(290)
    expect(secs).toBeLessThanOrEqual(360)
  })

  it('getResponseBaselineMs is the median of recent daily p95s once enough days exist', () => {
    const site = makeSite()
    for (let i = 1; i <= 5; i++) {
      const day = dayNDaysAgo(i)
      // p95 will be the max of the day's times
      rawCheck(site.id, 'up', `${day} 08:00:00`, 100 * i)
      rawCheck(site.id, 'up', `${day} 09:00:00`, 100 * i + 10)
      rollupDay(site.id, day)
    }
    // daily p95s ≈ [110, 210, 310, 410, 510] -> median 310
    expect(getResponseBaselineMs(site.id)).toBeCloseTo(310, -1)
  })

  it('returns null for the baseline with fewer than 3 rollup days', () => {
    const site = makeSite()
    const day = dayNDaysAgo(1)
    rawCheck(site.id, 'up', `${day} 08:00:00`, 100)
    rollupDay(site.id, day)
    expect(getResponseBaselineMs(site.id)).toBeNull()
  })
})
