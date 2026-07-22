import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import {
  countNotifications,
  dismissAllNotifications,
  insertNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
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
})
