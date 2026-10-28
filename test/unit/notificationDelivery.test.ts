import { describe, expect, it } from 'vitest'
import { isQuietNow, planDeliveries } from '../../app/utils/notificationDelivery'
import type { NotificationDelivery, NotificationRow, NotificationType } from '../../shared/types'

const night = { enabled: true, start: '22:00', end: '07:00', allow: 'feed' as const }
const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m)

function row(id: number, type: NotificationType, delivery: NotificationDelivery): NotificationRow {
  return {
    id, siteId: 1, siteName: null, siteUrl: 'https://a.test', type, message: `n${id}`,
    createdAt: '2026-01-01 00:00:00', read: false, dismissed: false, context: null, delivery,
  }
}

describe('isQuietNow', () => {
  it('is never quiet when disabled', () => {
    expect(isQuietNow({ ...night, enabled: false }, at(23))).toBe(false)
  })
  it('handles a window that wraps past midnight', () => {
    expect(isQuietNow(night, at(23))).toBe(true)
    expect(isQuietNow(night, at(3))).toBe(true)
    expect(isQuietNow(night, at(7))).toBe(false)
    expect(isQuietNow(night, at(12))).toBe(false)
    expect(isQuietNow(night, at(22))).toBe(true)
  })
  it('handles a same-day window', () => {
    const lunch = { ...night, start: '12:00', end: '13:30' }
    expect(isQuietNow(lunch, at(13))).toBe(true)
    expect(isQuietNow(lunch, at(13, 30))).toBe(false)
  })
})

describe('planDeliveries', () => {
  const settings = { quietHours: night, groupBurstsOver: 3 }

  it('never surfaces feed-only notifications', () => {
    const plan = planDeliveries([row(1, 'degraded', 'feed')], settings, at(12))
    expect(plan).toEqual({ individual: [], summary: null })
  })

  it('caps delivery during quiet hours but lets down and flapping through', () => {
    const plan = planDeliveries(
      [row(1, 'ssl_expiring', 'toast'), row(2, 'down', 'desktop'), row(3, 'flapping', 'toast')],
      settings,
      at(23),
    )
    expect(plan.individual.map((i) => [i.notification.id, i.level])).toEqual([
      [2, 'desktop'],
      [3, 'toast'],
    ])
  })

  it('collapses a big burst into one summary', () => {
    const fresh = [1, 2, 3, 4, 5].map((i) => row(i, i <= 3 ? 'down' : 'up', i === 1 ? 'desktop' : 'toast'))
    const plan = planDeliveries(fresh, settings, at(12))
    expect(plan.individual).toEqual([])
    expect(plan.summary).toEqual({ message: '5 new alerts — 3 down', level: 'desktop', count: 5 })
  })

  it('keeps a burst at the threshold individual', () => {
    const fresh = [1, 2, 3].map((i) => row(i, 'up', 'toast'))
    expect(planDeliveries(fresh, settings, at(12)).individual).toHaveLength(3)
  })
})
