import type { NotificationType } from '#shared/types'

/** Material Symbols ligature names — rendered via <UiIcon>. */
export const notificationTypeIcon: Record<NotificationType, string> = {
  down: 'error',
  up: 'check_circle',
  degraded: 'speed',
  ssl_expiring: 'lock',
  lighthouse_regression: 'trending_down',
}

/** Status tone per notification type, driving the tinted icon circles. */
export const notificationTypeTone: Record<NotificationType, 'up' | 'down' | 'degraded' | 'maint'> = {
  down: 'down',
  up: 'up',
  degraded: 'degraded',
  ssl_expiring: 'degraded',
  lighthouse_regression: 'maint',
}

/** Written out in full — Tailwind only sees complete class strings, so these
    can't be built by interpolating the tone name. */
export const notificationToneClass: Record<NotificationType, string> = {
  down: 'bg-down-tint text-down',
  up: 'bg-up-tint text-up',
  degraded: 'bg-degraded-tint text-degraded',
  ssl_expiring: 'bg-degraded-tint text-degraded',
  lighthouse_regression: 'bg-maint-tint text-maint',
}

export const notificationTypeLabel: Record<NotificationType, string> = {
  down: 'Down',
  up: 'Back up',
  degraded: 'Degraded',
  ssl_expiring: 'SSL expiring',
  lighthouse_regression: 'Lighthouse regression',
}

export function formatRelativeTime(iso: string): string {
  const t = new Date(`${iso.replace(' ', 'T')}Z`).getTime()
  const diffSec = Math.round((Date.now() - t) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`
  return `${Math.round(diffSec / 86400)}d ago`
}

export function formatAbsoluteTime(iso: string): string {
  return new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString()
}
