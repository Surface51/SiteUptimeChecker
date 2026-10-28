import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import { claimAlert } from '../../server/utils/alertState'
import {
  getNotificationSettings,
  parseNotificationOverrides,
  resolveForSite,
  saveNotificationSettings,
} from '../../server/utils/notificationSettings'
import { getDb, getSite, insertNotification, listNotifications, updateSite } from '../../server/utils/db'
import { DEFAULT_NOTIFICATION_SETTINGS } from '../../shared/notificationSettings'

beforeEach(resetDb)

describe('notification settings', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(getNotificationSettings()).toEqual(DEFAULT_NOTIFICATION_SETTINGS)
  })

  it('round-trips a save and fills gaps from the defaults', () => {
    saveNotificationSettings({ downConfirmations: 4, types: { up: { delivery: 'feed', cooldownHours: null } } })
    const s = getNotificationSettings()
    expect(s.downConfirmations).toBe(4)
    expect(s.types.up.delivery).toBe('feed')
    expect(s.types.down).toEqual(DEFAULT_NOTIFICATION_SETTINGS.types.down)
  })

  it.each([
    [{ downConfirmations: 0 }],
    [{ groupBurstsOver: 'lots' }],
    [{ types: { down: { delivery: 'loud', cooldownHours: null } } }],
    [{ types: { down: { delivery: 'toast', cooldownHours: 0.5 } } }],
    [{ flap: { window: 6, transitions: 9 } }],
    [{ quietHours: { start: '25:00' } }],
    [{ quietHours: { allow: 'off' } }],
  ])('rejects invalid settings %j', (body) => {
    expect(() => saveNotificationSettings(body)).toThrow()
    expect(getNotificationSettings()).toEqual(DEFAULT_NOTIFICATION_SETTINGS)
  })
})

describe('site overrides', () => {
  it('collapses empty overrides to null and rejects bad ones', () => {
    expect(parseNotificationOverrides({})).toBeNull()
    expect(parseNotificationOverrides({ types: {} })).toBeNull()
    expect(() => parseNotificationOverrides({ types: { nope: 'feed' } })).toThrow()
    expect(() => parseNotificationOverrides({ types: { down: 'loud' } })).toThrow()
    expect(() => parseNotificationOverrides({ downConfirmations: 99 })).toThrow()
  })

  it('persists on the site and wins over the global settings', () => {
    saveNotificationSettings({ downConfirmations: 3 })
    const site = makeSite()
    updateSite(site.id, { notificationOverrides: { downConfirmations: 1, types: { up: 'off' } } })
    const reloaded = getSite(site.id)!
    expect(reloaded.notificationOverrides).toEqual({ downConfirmations: 1, types: { up: 'off' } })
    const resolved = resolveForSite(reloaded)
    expect(resolved.downConfirmations).toBe(1)
    expect(resolved.recoveryConfirmations).toBe(1)
    expect(resolved.types.up.delivery).toBe('off')
    expect(resolved.types.down.delivery).toBe('desktop')
  })

  it('skips storing a notification of an overridden-off type', () => {
    const site = makeSite({ notificationOverrides: { types: { content_changed: 'off' } } })
    expect(insertNotification({ siteId: site.id, type: 'content_changed', message: 'x' })).toBe(false)
    expect(insertNotification({ siteId: site.id, type: 'ssl_expiring', message: 'y' })).toBe(true)
    expect(listNotifications({ limit: 10 }).map((n) => n.type)).toEqual(['ssl_expiring'])
  })
})

describe('configurable cooldowns', () => {
  it('uses the producer default until a cooldown is configured', () => {
    const site = makeSite()
    expect(claimAlert(site.id, 'content_changed', 'h', 24)).toBe(true)
    expect(claimAlert(site.id, 'content_changed', 'h', 24)).toBe(false)
  })

  it('lets the configured cooldown override the default', () => {
    const site = makeSite()
    claimAlert(site.id, 'degraded', '', 1)
    // Age the firing to 90 minutes: past the 1h default, inside a configured 2h.
    getDb().prepare(`UPDATE alert_state SET last_fired_at = datetime('now', '-90 minutes')`).run()
    saveNotificationSettings({ types: { degraded: { delivery: 'feed', cooldownHours: 2 } } })
    expect(claimAlert(site.id, 'degraded', '', 1)).toBe(false)
    saveNotificationSettings({ types: { degraded: { delivery: 'feed', cooldownHours: null } } })
    expect(claimAlert(site.id, 'degraded', '', 1)).toBe(true)
  })
})
