import type { NotificationType } from '#shared/types'

export const notificationTypeIcon: Record<NotificationType, string> = {
  down: '🔴',
  up: '🟢',
  degraded: '🟡',
  ssl_expiring: '🔒',
  lighthouse_regression: '📉',
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
