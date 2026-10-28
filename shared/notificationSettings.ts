import {
  NOTIFICATION_TYPES,
  type NotificationDelivery,
  type NotificationOverrides,
  type NotificationSettings,
  type NotificationType,
  type NotificationTypeSetting,
} from './types'

export const NOTIFICATION_DELIVERIES = ['off', 'feed', 'toast', 'desktop'] as const satisfies readonly NotificationDelivery[]

// Quieter than "everything toasts": noisy-by-nature types stay in the feed, `down` is the only
// one that reaches the desktop.
const DEFAULT_DELIVERY: Record<NotificationType, NotificationDelivery> = {
  down: 'desktop',
  up: 'toast',
  degraded: 'feed',
  flapping: 'toast',
  ssl_expiring: 'toast',
  lighthouse_regression: 'toast',
  domain_expiring: 'toast',
  nameservers_changed: 'toast',
  ssl_issuer_changed: 'toast',
  content_changed: 'feed',
  log_5xx_spike: 'toast',
  log_php_fatal: 'toast',
  log_threat_ip: 'toast',
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  types: Object.fromEntries(
    NOTIFICATION_TYPES.map((t) => [t, { delivery: DEFAULT_DELIVERY[t], cooldownHours: null }]),
  ) as Record<NotificationType, NotificationTypeSetting>,
  downConfirmations: 2,
  recoveryConfirmations: 1,
  degradedConfirmations: 3,
  flap: { window: 10, transitions: 4 },
  quietHours: { enabled: false, start: '22:00', end: '07:00', allow: 'feed' },
  groupBurstsOver: 3,
}

/** Overlay a stored (possibly partial or stale) settings blob onto the defaults. */
export function mergeNotificationSettings(stored: unknown): NotificationSettings {
  const d = DEFAULT_NOTIFICATION_SETTINGS
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<NotificationSettings>
  const types = { ...d.types }
  for (const t of NOTIFICATION_TYPES) {
    const st = s.types?.[t]
    if (st) types[t] = { ...d.types[t], ...st }
  }
  return {
    ...d,
    ...s,
    types,
    flap: { ...d.flap, ...s.flap },
    quietHours: { ...d.quietHours, ...s.quietHours },
  }
}

/** The settings in force for one site: the global ones with the site's overrides on top. */
export function resolveSettingsForSite(
  global: NotificationSettings,
  overrides: NotificationOverrides | null,
): NotificationSettings {
  if (!overrides) return global
  const types = { ...global.types }
  for (const [t, delivery] of Object.entries(overrides.types ?? {}) as [NotificationType, NotificationDelivery][]) {
    if (types[t] && delivery) types[t] = { ...types[t], delivery }
  }
  return {
    ...global,
    types,
    downConfirmations: overrides.downConfirmations ?? global.downConfirmations,
    recoveryConfirmations: overrides.recoveryConfirmations ?? global.recoveryConfirmations,
    degradedConfirmations: overrides.degradedConfirmations ?? global.degradedConfirmations,
  }
}
