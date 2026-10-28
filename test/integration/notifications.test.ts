import { beforeEach, describe, expect, it } from 'vitest'
import { makeCheckInput, makeSite, resetDb } from '../helpers/db'
import { getLatestCheck, insertCheck, listNotifications } from '../../server/utils/db'
import { detectAndNotify } from '../../server/utils/notifications'
import { saveNotificationSettings } from '../../server/utils/notificationSettings'
import type { CheckRow, CheckStatus, Site } from '../../shared/types'

beforeEach(resetDb)

function makeCheckRow(overrides: Partial<CheckRow> = {}): CheckRow {
  return {
    id: 1,
    siteId: 1,
    checkedAt: '2026-01-01 00:00:00',
    status: 'up',
    httpStatus: 200,
    error: null,
    timeDns: null,
    timeTcp: null,
    timeTls: null,
    timeTtfb: null,
    timeTotal: 100,
    sslValid: null,
    sslIssuer: null,
    sslExpiresAt: null,
    sslDaysRemaining: null,
    pageTitle: null,
    contentLength: null,
    contentType: null,
    redirectChain: [],
    securityHeaders: null,
    dnsRecords: null,
    responseHeaders: {},
    ...overrides,
  }
}

/** Record checks one by one the way runCheck does: store, then detectAndNotify. */
function runChecks(site: Site, statuses: CheckStatus[], overrides: Partial<CheckRow> = {}) {
  for (const status of statuses) {
    const previous = getLatestCheck(site.id)
    const current = insertCheck(makeCheckInput(site.id, status, overrides))
    detectAndNotify(site, previous, current)
  }
}

describe('detectAndNotify', () => {
  it('does not alert on a single failed check', () => {
    const site = makeSite()
    runChecks(site, ['up', 'down', 'up'])
    expect(listNotifications({ limit: 10 })).toHaveLength(0)
  })

  it('notifies "down" once the failure has lasted the confirmation count', () => {
    const site = makeSite({ name: 'Site A' })
    runChecks(site, ['up', 'down', 'down'], { httpStatus: 503 })
    const notes = listNotifications({ limit: 10 })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ type: 'down', message: 'Site A is down (HTTP 503)', delivery: 'desktop' })
    expect(notes[0]!.context).toEqual({ kind: 'check', httpStatus: 503, reason: 'HTTP 503' })
  })

  it('does not re-notify "down" while the site stays down', () => {
    const site = makeSite()
    runChecks(site, ['down', 'down', 'down', 'down'])
    expect(listNotifications({ limit: 10 })).toHaveLength(1)
  })

  it('notifies "up" after an alerted outage recovers', () => {
    const site = makeSite({ name: 'Site A' })
    runChecks(site, ['down', 'down', 'up'])
    const notes = listNotifications({ limit: 10 })
    // Same-second rows have no defined order, so compare as a set.
    expect(notes.map((n) => n.type).sort()).toEqual(['down', 'up'])
    expect(notes.find((n) => n.type === 'up')).toMatchObject({ message: 'Site A is back up' })
  })

  it('never sends "up" for an outage that was not alerted', () => {
    const site = makeSite()
    runChecks(site, ['up', 'down', 'up', 'up'])
    expect(listNotifications({ limit: 10 })).toHaveLength(0)
  })

  it('honours a per-site confirmation override', () => {
    const site = makeSite({ notificationOverrides: { downConfirmations: 1 } })
    runChecks(site, ['up', 'down'])
    expect(listNotifications({ limit: 10 }).map((n) => n.type)).toEqual(['down'])
  })

  it('notifies "degraded" only after it persists, and only once', () => {
    const site = makeSite()
    runChecks(site, ['up', 'degraded', 'degraded'])
    expect(listNotifications({ limit: 10 })).toHaveLength(0)
    runChecks(site, ['degraded', 'degraded'])
    const notes = listNotifications({ limit: 10 })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ type: 'degraded', delivery: 'feed' })
  })

  it('sends one "flapping" alert instead of down/up pairs, then "up" once it settles', () => {
    const site = makeSite()
    runChecks(site, ['up', 'down', 'up', 'down', 'up'])
    expect(listNotifications({ limit: 10 }).map((n) => n.type)).toEqual(['flapping'])
    runChecks(site, ['up', 'up', 'up', 'up', 'up', 'up'])
    expect(listNotifications({ limit: 10 }).map((n) => n.type).sort()).toEqual(['flapping', 'up'])
  })

  it('records nothing for a type switched off globally', () => {
    saveNotificationSettings({ types: { down: { delivery: 'off', cooldownHours: null } } })
    const site = makeSite()
    runChecks(site, ['down', 'down'])
    expect(listNotifications({ limit: 10 })).toHaveLength(0)
  })

  it('lets a site override the delivery of a type', () => {
    const site = makeSite({ notificationOverrides: { types: { down: 'feed' } } })
    runChecks(site, ['down', 'down'])
    expect(listNotifications({ limit: 10 })[0]).toMatchObject({ type: 'down', delivery: 'feed' })
  })

  it('has no previous check: does not notify down/up/degraded transitions', () => {
    const site = makeSite()
    detectAndNotify(site, null, makeCheckRow({ siteId: site.id, status: 'up' }))
    expect(listNotifications({ limit: 10 })).toHaveLength(0)
  })

  it('notifies ssl_expiring when days remaining first crosses below the threshold', () => {
    const site = makeSite()
    const previous = makeCheckRow({ siteId: site.id, status: 'up', sslDaysRemaining: 20 })
    const current = makeCheckRow({ siteId: site.id, status: 'up', sslDaysRemaining: 10 })
    detectAndNotify(site, previous, current)
    const notes = listNotifications({ limit: 10 })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ type: 'ssl_expiring' })
    expect(notes[0]!.message).toContain('10 days')
  })

  it('does not re-notify ssl_expiring if already below the threshold', () => {
    const site = makeSite()
    const previous = makeCheckRow({ siteId: site.id, status: 'up', sslDaysRemaining: 10 })
    const current = makeCheckRow({ siteId: site.id, status: 'up', sslDaysRemaining: 9 })
    detectAndNotify(site, previous, current)
    expect(listNotifications({ limit: 10 })).toHaveLength(0)
  })

  it('uses singular "day" when exactly 1 day remains', () => {
    const site = makeSite()
    const previous = makeCheckRow({ siteId: site.id, status: 'up', sslDaysRemaining: 14 })
    const current = makeCheckRow({ siteId: site.id, status: 'up', sslDaysRemaining: 1 })
    detectAndNotify(site, previous, current)
    expect(listNotifications({ limit: 10 })[0]!.message).toContain('1 day')
    expect(listNotifications({ limit: 10 })[0]!.message).not.toContain('1 days')
  })
})
