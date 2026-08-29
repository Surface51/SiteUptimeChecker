import { beforeEach, describe, expect, it } from 'vitest'
import { makeCheckInput, makeSite, resetDb } from '../helpers/db'
import { getDailyUptime, getDb, getSparkline, getStatusTicks, getUptime, insertCheck } from '../../server/utils/db'

beforeEach(resetDb)

/**
 * insertCheck() always stamps checked_at as "now", which makes it impossible to
 * control ordering/bucketing precisely (ties, same-day-only). These uptime/history
 * queries care about checked_at, so write rows directly with an explicit timestamp.
 */
function rawInsertCheck(siteId: number, status: string, checkedAt: string, timeTotal: number | null = null) {
  getDb()
    .prepare('INSERT INTO checks (site_id, status, checked_at, time_total) VALUES (?, ?, ?, ?)')
    .run(siteId, status, checkedAt, timeTotal)
}

describe('getUptime', () => {
  it('returns null when there are no checks', () => {
    const site = makeSite()
    expect(getUptime(site.id, 24)).toBeNull()
  })

  it('computes the percentage of non-down checks', () => {
    const site = makeSite()
    insertCheck(makeCheckInput(site.id, 'up'))
    insertCheck(makeCheckInput(site.id, 'up'))
    insertCheck(makeCheckInput(site.id, 'up'))
    insertCheck(makeCheckInput(site.id, 'down'))
    expect(getUptime(site.id, 24)).toBe(75)
  })

  it('treats degraded checks as up (not down)', () => {
    const site = makeSite()
    insertCheck(makeCheckInput(site.id, 'degraded'))
    expect(getUptime(site.id, 24)).toBe(100)
  })

  it('excludes checks outside the requested window', () => {
    const site = makeSite()
    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    rawInsertCheck(site.id, 'down', twoDaysAgo)
    insertCheck(makeCheckInput(site.id, 'up'))
    expect(getUptime(site.id, 24)).toBe(100)
  })
})

describe('getDailyUptime', () => {
  it('buckets checks by UTC calendar day and fills gaps with null/0', () => {
    const site = makeSite()
    const today = new Date()
    const todayKey = today.toISOString().slice(0, 10)
    const twoDaysAgo = new Date(today.getTime() - 2 * 86400 * 1000).toISOString().slice(0, 10)

    rawInsertCheck(site.id, 'up', `${todayKey} 10:00:00`)
    rawInsertCheck(site.id, 'down', `${todayKey} 11:00:00`)
    rawInsertCheck(site.id, 'up', `${twoDaysAgo} 09:00:00`)

    const daily = getDailyUptime(site.id, 7)
    const todayBucket = daily.find((d) => d.date === todayKey)
    const twoDaysAgoBucket = daily.find((d) => d.date === twoDaysAgo)
    const yesterdayKey = new Date(today.getTime() - 86400 * 1000).toISOString().slice(0, 10)
    const yesterdayBucket = daily.find((d) => d.date === yesterdayKey)

    expect(todayBucket).toMatchObject({ date: todayKey, total: 2, uptime: 50 })
    expect(twoDaysAgoBucket).toMatchObject({ date: twoDaysAgo, total: 1, uptime: 100 })
    expect(yesterdayBucket).toMatchObject({ date: yesterdayKey, total: 0, uptime: null })
  })

  it('returns exactly `days` entries in ascending date order', () => {
    const site = makeSite()
    const daily = getDailyUptime(site.id, 5)
    expect(daily).toHaveLength(5)
    for (let i = 1; i < daily.length; i++) {
      expect(daily[i]!.date > daily[i - 1]!.date).toBe(true)
    }
  })
})

describe('getSparkline', () => {
  it('returns time_total values in chronological (oldest-first) order', () => {
    const site = makeSite()
    rawInsertCheck(site.id, 'up', '2026-01-01 00:00:00', 100)
    rawInsertCheck(site.id, 'up', '2026-01-01 00:01:00', 200)
    rawInsertCheck(site.id, 'up', '2026-01-01 00:02:00', 300)
    expect(getSparkline(site.id)).toEqual([100, 200, 300])
  })

  it('skips checks with a null time_total', () => {
    const site = makeSite()
    rawInsertCheck(site.id, 'down', '2026-01-01 00:00:00', null)
    rawInsertCheck(site.id, 'up', '2026-01-01 00:01:00', 150)
    expect(getSparkline(site.id)).toEqual([150])
  })

  it('respects the limit, keeping the most recent entries', () => {
    const site = makeSite()
    rawInsertCheck(site.id, 'up', '2026-01-01 00:00:00', 1)
    rawInsertCheck(site.id, 'up', '2026-01-01 00:01:00', 2)
    rawInsertCheck(site.id, 'up', '2026-01-01 00:02:00', 3)
    expect(getSparkline(site.id, 2)).toEqual([2, 3])
  })
})

describe('getStatusTicks', () => {
  it('returns statuses in chronological order', () => {
    const site = makeSite()
    rawInsertCheck(site.id, 'up', '2026-01-01 00:00:00')
    rawInsertCheck(site.id, 'down', '2026-01-01 00:01:00')
    rawInsertCheck(site.id, 'up', '2026-01-01 00:02:00')
    expect(getStatusTicks(site.id).map((t) => t.status)).toEqual(['up', 'down', 'up'])
  })
})
