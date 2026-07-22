import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatAbsoluteTime,
  formatRelativeTime,
  notificationTypeIcon,
  notificationTypeLabel,
} from '../../app/utils/notificationDisplay'
import type { NotificationType } from '../../shared/types'

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
  const types: NotificationType[] = ['down', 'up', 'degraded', 'ssl_expiring', 'lighthouse_regression']

  it('has an icon for every NotificationType', () => {
    for (const type of types) {
      expect(notificationTypeIcon[type]).toBeTruthy()
    }
  })

  it('has a label for every NotificationType', () => {
    for (const type of types) {
      expect(notificationTypeLabel[type]).toBeTruthy()
    }
  })
})
