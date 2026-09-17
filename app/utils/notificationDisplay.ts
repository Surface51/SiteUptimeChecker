import { NOTIFICATION_TYPES, type NotificationRow, type NotificationType } from '#shared/types'

/** Material Symbols ligature names — rendered via <UiIcon>. */
export const notificationTypeIcon: Record<NotificationType, string> = {
  down: 'error',
  up: 'check_circle',
  degraded: 'speed',
  ssl_expiring: 'lock',
  lighthouse_regression: 'trending_down',
  domain_expiring: 'event_busy',
  nameservers_changed: 'dns',
  ssl_issuer_changed: 'verified_user',
  content_changed: 'find_replace',
  log_5xx_spike: 'report',
  log_php_fatal: 'bug_report',
  log_threat_ip: 'shield',
}

/** Status tone per notification type, driving the tinted icon circles. */
export const notificationTypeTone: Record<NotificationType, 'up' | 'down' | 'degraded' | 'maint'> = {
  down: 'down',
  up: 'up',
  degraded: 'degraded',
  ssl_expiring: 'degraded',
  lighthouse_regression: 'maint',
  domain_expiring: 'degraded',
  nameservers_changed: 'maint',
  ssl_issuer_changed: 'maint',
  content_changed: 'degraded',
  log_5xx_spike: 'down',
  log_php_fatal: 'down',
  log_threat_ip: 'degraded',
}

/** Written out in full — Tailwind only sees complete class strings, so these
    can't be built by interpolating the tone name. */
export const notificationToneClass: Record<NotificationType, string> = {
  down: 'bg-down-tint text-down',
  up: 'bg-up-tint text-up',
  degraded: 'bg-degraded-tint text-degraded',
  ssl_expiring: 'bg-degraded-tint text-degraded',
  lighthouse_regression: 'bg-maint-tint text-maint',
  domain_expiring: 'bg-degraded-tint text-degraded',
  nameservers_changed: 'bg-maint-tint text-maint',
  ssl_issuer_changed: 'bg-maint-tint text-maint',
  content_changed: 'bg-degraded-tint text-degraded',
  log_5xx_spike: 'bg-down-tint text-down',
  log_php_fatal: 'bg-down-tint text-down',
  log_threat_ip: 'bg-degraded-tint text-degraded',
}

export const notificationTypeLabel: Record<NotificationType, string> = {
  down: 'Down',
  up: 'Back up',
  degraded: 'Degraded',
  ssl_expiring: 'SSL expiring',
  lighthouse_regression: 'Lighthouse regression',
  domain_expiring: 'Domain expiring',
  nameservers_changed: 'Nameservers changed',
  ssl_issuer_changed: 'Cert issuer changed',
  content_changed: 'Content changed',
  log_5xx_spike: 'Error spike',
  log_php_fatal: 'PHP fatals',
  log_threat_ip: 'Suspicious IP',
}

/** Options for the type filter on the notifications page — derived from the label map above so a
 * type can't go missing from the dropdown the way the old hardcoded list did. */
export const notificationTypeOptions: { label: string; value: NotificationType | '' }[] = [
  { label: 'All types', value: '' },
  ...NOTIFICATION_TYPES.map((value) => ({ label: notificationTypeLabel[value], value })),
]

/** Coarse severity, for the severity filter. Doesn't need per-type nuance the way tone/icon do. */
export const notificationSeverity: Record<NotificationType, 'critical' | 'warning' | 'info'> = {
  down: 'critical',
  log_5xx_spike: 'critical',
  log_php_fatal: 'critical',
  up: 'info',
  nameservers_changed: 'info',
  ssl_issuer_changed: 'info',
  degraded: 'warning',
  ssl_expiring: 'warning',
  lighthouse_regression: 'warning',
  domain_expiring: 'warning',
  content_changed: 'warning',
  log_threat_ip: 'warning',
}

export const notificationSeverityLabel: Record<'critical' | 'warning' | 'info', string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
}

/**
 * Where clicking a notification should go. A row with a stored `context` opens the incident view
 * built for its alert kind; older rows (inserted before `context` existed) fall back to the site
 * page, same as every notification used to behave.
 */
export function notificationHref(n: Pick<NotificationRow, 'id' | 'siteId' | 'context'>): string {
  return n.context ? `/notifications/${n.id}` : `/sites/${n.siteId}`
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
