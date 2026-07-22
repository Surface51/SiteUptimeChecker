import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import { listNotifications } from '../../server/utils/db'
import { detectAndNotify } from '../../server/utils/notifications'
import type { CheckRow } from '../../shared/types'

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

describe('detectAndNotify', () => {
  it('notifies "down" on a transition from up to down', () => {
    const site = makeSite({ name: 'Site A' })
    const previous = makeCheckRow({ siteId: site.id, status: 'up' })
    const current = makeCheckRow({ siteId: site.id, status: 'down', httpStatus: 503 })
    detectAndNotify(site, previous, current)
    const notes = listNotifications({ limit: 10 })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ type: 'down', message: 'Site A is down (HTTP 503)' })
  })

  it('does not re-notify "down" while already down', () => {
    const site = makeSite()
    const previous = makeCheckRow({ siteId: site.id, status: 'down' })
    const current = makeCheckRow({ siteId: site.id, status: 'down' })
    detectAndNotify(site, previous, current)
    expect(listNotifications({ limit: 10 })).toHaveLength(0)
  })

  it('notifies "up" on a transition from down to up', () => {
    const site = makeSite({ name: 'Site A' })
    const previous = makeCheckRow({ siteId: site.id, status: 'down' })
    const current = makeCheckRow({ siteId: site.id, status: 'up' })
    detectAndNotify(site, previous, current)
    const notes = listNotifications({ limit: 10 })
    expect(notes[0]).toMatchObject({ type: 'up', message: 'Site A is back up' })
  })

  it('notifies "degraded" only on a transition from up to degraded', () => {
    const site = makeSite()
    detectAndNotify(
      site,
      makeCheckRow({ siteId: site.id, status: 'up' }),
      makeCheckRow({ siteId: site.id, status: 'degraded' }),
    )
    expect(listNotifications({ limit: 10 })[0]).toMatchObject({ type: 'degraded' })
  })

  it('does not notify "degraded" when already degraded', () => {
    const site = makeSite()
    detectAndNotify(
      site,
      makeCheckRow({ siteId: site.id, status: 'degraded' }),
      makeCheckRow({ siteId: site.id, status: 'degraded' }),
    )
    expect(listNotifications({ limit: 10 })).toHaveLength(0)
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
