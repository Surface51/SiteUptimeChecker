import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import {
  countNotifications,
  dismissAllNotifications,
  dismissNotification,
  getDb,
  getNotification,
  insertNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  restoreNotifications,
  setNotificationRead,
} from '../../server/utils/db'

beforeEach(resetDb)

describe('notifications', () => {
  it('inserts and lists a notification joined with its site', () => {
    const site = makeSite({ url: 'https://n.test/', name: 'N' })
    insertNotification({ siteId: site.id, type: 'down', message: 'N is down' })
    const [n] = listNotifications({ limit: 10 })
    expect(n).toMatchObject({ siteId: site.id, siteName: 'N', siteUrl: 'https://n.test/', type: 'down', read: false, dismissed: false })
  })

  it('excludes dismissed notifications by default', () => {
    const site = makeSite()
    insertNotification({ siteId: site.id, type: 'down', message: 'a' })
    dismissAllNotifications()
    expect(listNotifications({ limit: 10 })).toHaveLength(0)
    expect(listNotifications({ limit: 10, includeDismissed: true })).toHaveLength(1)
  })

  it('filters by siteId', () => {
    const siteA = makeSite()
    const siteB = makeSite()
    insertNotification({ siteId: siteA.id, type: 'down', message: 'a down' })
    insertNotification({ siteId: siteB.id, type: 'down', message: 'b down' })
    const results = listNotifications({ limit: 10, siteId: siteA.id })
    expect(results).toHaveLength(1)
    expect(results[0]!.siteId).toBe(siteA.id)
  })

  it('filters by type', () => {
    const site = makeSite()
    insertNotification({ siteId: site.id, type: 'down', message: 'down' })
    insertNotification({ siteId: site.id, type: 'up', message: 'up' })
    const results = listNotifications({ limit: 10, type: 'up' })
    expect(results).toHaveLength(1)
    expect(results[0]!.type).toBe('up')
  })

  it('filters unreadOnly', () => {
    const site = makeSite()
    insertNotification({ siteId: site.id, type: 'down', message: 'a' })
    insertNotification({ siteId: site.id, type: 'up', message: 'b' })
    const toMarkRead = listNotifications({ limit: 10 }).find((n) => n.message === 'a')!
    markNotificationRead(toMarkRead.id)
    const unread = listNotifications({ limit: 10, unreadOnly: true })
    expect(unread).toHaveLength(1)
    expect(unread[0]!.message).toBe('b')
  })

  it('markAllNotificationsRead marks every notification read', () => {
    const site = makeSite()
    insertNotification({ siteId: site.id, type: 'down', message: 'a' })
    insertNotification({ siteId: site.id, type: 'up', message: 'b' })
    markAllNotificationsRead()
    expect(listNotifications({ limit: 10 }).every((n) => n.read)).toBe(true)
  })

  it('dismissAllNotifications scoped to a siteId only affects that site', () => {
    const siteA = makeSite()
    const siteB = makeSite()
    insertNotification({ siteId: siteA.id, type: 'down', message: 'a' })
    insertNotification({ siteId: siteB.id, type: 'down', message: 'b' })
    dismissAllNotifications({ siteId: siteA.id })
    expect(listNotifications({ limit: 10 })).toHaveLength(1)
    expect(listNotifications({ limit: 10 })[0]!.siteId).toBe(siteB.id)
  })

  it('countNotifications respects the same filters as listNotifications', () => {
    const site = makeSite()
    insertNotification({ siteId: site.id, type: 'down', message: 'a' })
    insertNotification({ siteId: site.id, type: 'up', message: 'b' })
    expect(countNotifications()).toBe(2)
    expect(countNotifications({ type: 'down' })).toBe(1)
  })

  it('round-trips a structured context through insert and list', () => {
    const site = makeSite()
    insertNotification({
      siteId: site.id,
      type: 'log_threat_ip',
      message: 'x hit y',
      context: { kind: 'threat_ip', logSlug: 'acme', ip: '1.2.3.4', hits: 500, window: { from: 'a', to: 'b' } },
    })
    const [n] = listNotifications({ limit: 10 })
    expect(n!.context).toEqual({
      kind: 'threat_ip',
      logSlug: 'acme',
      ip: '1.2.3.4',
      hits: 500,
      window: { from: 'a', to: 'b' },
    })
  })

  it('has a null context when none was given', () => {
    const site = makeSite()
    insertNotification({ siteId: site.id, type: 'down', message: 'a' })
    const [n] = listNotifications({ limit: 10 })
    expect(n!.context).toBeNull()
  })

  it('treats a malformed context column as absent rather than throwing', () => {
    const site = makeSite()
    insertNotification({ siteId: site.id, type: 'down', message: 'a' })
    const [n] = listNotifications({ limit: 10 })
    getDb().prepare('UPDATE notifications SET context = ? WHERE id = ?').run('{not json', n!.id)
    expect(listNotifications({ limit: 10 })[0]!.context).toBeNull()
    expect(getNotification(n!.id)!.context).toBeNull()
  })

  it('filters by types (comma-separated set)', () => {
    const site = makeSite()
    insertNotification({ siteId: site.id, type: 'down', message: 'a' })
    insertNotification({ siteId: site.id, type: 'up', message: 'b' })
    insertNotification({ siteId: site.id, type: 'degraded', message: 'c' })
    const results = listNotifications({ limit: 10, types: ['down', 'degraded'] })
    expect(results.map((n) => n.type).sort()).toEqual(['degraded', 'down'])
  })

  it('filters by a case-sensitive message substring, escaping LIKE wildcards', () => {
    const site = makeSite()
    insertNotification({ siteId: site.id, type: 'log_threat_ip', message: '50% of requests from 1.2.3.4' })
    insertNotification({ siteId: site.id, type: 'log_threat_ip', message: 'unrelated' })
    expect(listNotifications({ limit: 10, q: '1.2.3.4' })).toHaveLength(1)
    // A literal '%' in the search term must not act as a wildcard.
    expect(listNotifications({ limit: 10, q: '50%' })).toHaveLength(1)
    expect(listNotifications({ limit: 10, q: 'nope' })).toHaveLength(0)
  })

  it('getNotification returns a single row joined with its site, or null', () => {
    const site = makeSite({ name: 'N' })
    insertNotification({ siteId: site.id, type: 'down', message: 'a' })
    const [n] = listNotifications({ limit: 10 })
    expect(getNotification(n!.id)).toMatchObject({ id: n!.id, siteName: 'N' })
    expect(getNotification(-1)).toBeNull()
  })

  it('setNotificationRead toggles read state in either direction', () => {
    const site = makeSite()
    insertNotification({ siteId: site.id, type: 'down', message: 'a' })
    const [n] = listNotifications({ limit: 10 })
    setNotificationRead(n!.id, true)
    expect(getNotification(n!.id)!.read).toBe(true)
    setNotificationRead(n!.id, false)
    expect(getNotification(n!.id)!.read).toBe(false)
  })

  it('dismissNotification dismisses only the given row', () => {
    const site = makeSite()
    insertNotification({ siteId: site.id, type: 'down', message: 'a' })
    insertNotification({ siteId: site.id, type: 'up', message: 'b' })
    const [a, b] = listNotifications({ limit: 10 })
    dismissNotification(a!.id)
    expect(listNotifications({ limit: 10 }).map((n) => n.id)).toEqual([b!.id])
    expect(getNotification(a!.id)!.dismissed).toBe(true)
  })

  it('restoreNotifications un-dismisses exactly the given ids', () => {
    const site = makeSite()
    insertNotification({ siteId: site.id, type: 'down', message: 'a' })
    insertNotification({ siteId: site.id, type: 'up', message: 'b' })
    const ids = listNotifications({ limit: 10 }).map((n) => n.id)
    dismissAllNotifications()
    expect(listNotifications({ limit: 10 })).toHaveLength(0)
    restoreNotifications(ids)
    expect(listNotifications({ limit: 10 })).toHaveLength(2)
  })
})
