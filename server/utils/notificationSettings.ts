import { createError } from 'h3'
import { NOTIFICATION_TYPES } from '../../shared/types'
import type {
  NotificationDelivery,
  NotificationOverrides,
  NotificationSettings,
  NotificationType,
  Site,
} from '#shared/types'
import {
  NOTIFICATION_DELIVERIES,
  mergeNotificationSettings,
  resolveSettingsForSite,
} from '../../shared/notificationSettings'
import { getStoredNotificationSettings, setStoredNotificationSettings } from './db'

function bad(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

function isDelivery(v: unknown): v is NotificationDelivery {
  return typeof v === 'string' && (NOTIFICATION_DELIVERIES as readonly string[]).includes(v)
}

function intInRange(v: unknown, min: number, max: number, label: string): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) bad(`${label} must be a whole number from ${min} to ${max}`)
  return n
}

function isTime(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
}

export function getNotificationSettings(): NotificationSettings {
  return mergeNotificationSettings(getStoredNotificationSettings())
}

export function resolveForSite(site: Pick<Site, 'notificationOverrides'>): NotificationSettings {
  return resolveSettingsForSite(getNotificationSettings(), site.notificationOverrides)
}

/** Validates a full settings body (as sent by the settings page) and returns the clean value. */
export function parseNotificationSettings(body: unknown): NotificationSettings {
  if (!body || typeof body !== 'object') bad('Expected a settings object')
  const b = body as Partial<NotificationSettings>
  const merged = mergeNotificationSettings(b)

  for (const t of NOTIFICATION_TYPES) {
    const { delivery, cooldownHours } = merged.types[t]
    if (!isDelivery(delivery)) bad(`Invalid delivery for ${t}`)
    if (cooldownHours !== null) intInRange(cooldownHours, 1, 24 * 30, `Cooldown for ${t}`)
  }

  intInRange(merged.downConfirmations, 1, 10, 'Down confirmations')
  intInRange(merged.recoveryConfirmations, 1, 10, 'Recovery confirmations')
  intInRange(merged.degradedConfirmations, 1, 10, 'Degraded confirmations')
  intInRange(merged.flap.window, 4, 50, 'Flap window')
  intInRange(merged.flap.transitions, 2, merged.flap.window, 'Flap transitions')
  intInRange(merged.groupBurstsOver, 1, 50, 'Burst grouping threshold')

  const q = merged.quietHours
  if (typeof q.enabled !== 'boolean') bad('Quiet hours enabled must be true or false')
  if (!isTime(q.start) || !isTime(q.end)) bad('Quiet hours must be HH:MM')
  if (!isDelivery(q.allow) || q.allow === 'off') bad('Invalid quiet-hours delivery')

  return merged
}

export function saveNotificationSettings(body: unknown): NotificationSettings {
  const clean = parseNotificationSettings(body)
  setStoredNotificationSettings(clean)
  return clean
}

/** Validates a site's overrides; an empty object collapses to null (= follow the global ones). */
export function parseNotificationOverrides(raw: unknown): NotificationOverrides | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) bad('Notification overrides must be an object')
  const r = raw as Record<string, unknown>
  const out: NotificationOverrides = {}

  if (r.types !== undefined) {
    if (!r.types || typeof r.types !== 'object') bad('Notification overrides types must be an object')
    const types: Partial<Record<NotificationType, NotificationDelivery>> = {}
    for (const [t, delivery] of Object.entries(r.types as Record<string, unknown>)) {
      if (!(NOTIFICATION_TYPES as readonly string[]).includes(t)) bad(`Unknown notification type: ${t}`)
      if (!isDelivery(delivery)) bad(`Invalid delivery for ${t}`)
      types[t as NotificationType] = delivery
    }
    if (Object.keys(types).length) out.types = types
  }
  for (const key of ['downConfirmations', 'recoveryConfirmations', 'degradedConfirmations'] as const) {
    if (r[key] !== undefined && r[key] !== null) out[key] = intInRange(r[key], 1, 10, key)
  }

  return Object.keys(out).length ? out : null
}
