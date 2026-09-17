import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatAbsoluteTime,
  formatRelativeTime,
  notificationHref,
  notificationSeverity,
  notificationToneClass,
  notificationTypeIcon,
  notificationTypeLabel,
  notificationTypeOptions,
  notificationTypeTone,
} from '../../app/utils/notificationDisplay'
import { NOTIFICATION_TYPES } from '../../shared/types'

const NOW = new Date('2026-07-21T12:00:00Z')

// Timestamps come from SQLite as "YYYY-MM-DD HH:MM:SS" (space, no zone, implicitly
// UTC) — formatRelativeTime/formatAbsoluteTime replace the space with 'T' and treat
// it as UTC. Use that same shape here.
function isoSecondsAgo(seconds: number): string {
  const d = new Date(NOW.getTime() - seconds * 1000)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats sub-minute durations in seconds', () => {
    expect(formatRelativeTime(isoSecondsAgo(30))).toBe('30s ago')
  })

  it('formats sub-hour durations in minutes', () => {
    expect(formatRelativeTime(isoSecondsAgo(90))).toBe('2m ago')
  })

  it('formats sub-day durations in hours', () => {
    expect(formatRelativeTime(isoSecondsAgo(2 * 3600))).toBe('2h ago')
  })

  it('formats durations of a day or more in days', () => {
    expect(formatRelativeTime(isoSecondsAgo(3 * 86400))).toBe('3d ago')
  })

  it('sits right at the minute boundary', () => {
    expect(formatRelativeTime(isoSecondsAgo(59))).toBe('59s ago')
    expect(formatRelativeTime(isoSecondsAgo(60))).toBe('1m ago')
  })
})

describe('formatAbsoluteTime', () => {
  it('parses a SQLite-style UTC timestamp without throwing', () => {
    const result = formatAbsoluteTime('2026-07-21 12:00:00')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('notification type maps', () => {
  it('has an icon, label, tone, tone-class and severity for every NotificationType', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(notificationTypeIcon[type]).toBeTruthy()
      expect(notificationTypeLabel[type]).toBeTruthy()
      expect(notificationTypeTone[type]).toBeTruthy()
      expect(notificationToneClass[type]).toBeTruthy()
      expect(notificationSeverity[type]).toBeTruthy()
    }
  })

  it('notificationTypeOptions offers an "all" option plus one entry per type', () => {
    expect(notificationTypeOptions[0]).toEqual({ label: 'All types', value: '' })
    expect(notificationTypeOptions.slice(1).map((o) => o.value).sort()).toEqual([...NOTIFICATION_TYPES].sort())
  })
})

describe('notificationHref', () => {
  it('links to the incident view when the notification carries a context', () => {
    const href = notificationHref({
      id: 42,
      siteId: 7,
      context: { kind: 'threat_ip', logSlug: 'acme', ip: '1.2.3.4', hits: 10, window: { from: 'a', to: 'b' } },
    })
    expect(href).toBe('/notifications/42')
  })

  it('falls back to the site page when there is no context (older rows)', () => {
    expect(notificationHref({ id: 42, siteId: 7, context: null })).toBe('/sites/7')
  })
})
