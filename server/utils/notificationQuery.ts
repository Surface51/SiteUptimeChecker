import { NOTIFICATION_TYPES, type NotificationType } from '#shared/types'

/** Parses a comma-separated `types` query param, dropping anything that isn't a real
 * NotificationType — shared by the list and count endpoints so they can't drift out of sync
 * the way the list endpoint's old hardcoded VALID_TYPES did. */
export function parseNotificationTypes(raw: unknown): NotificationType[] | undefined {
  if (typeof raw !== 'string' || !raw) return undefined
  const types = raw
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is NotificationType => NOTIFICATION_TYPES.includes(t as NotificationType))
  return types.length > 0 ? types : undefined
}

export function parseNotificationType(raw: unknown): NotificationType | undefined {
  return NOTIFICATION_TYPES.includes(raw as NotificationType) ? (raw as NotificationType) : undefined
}
