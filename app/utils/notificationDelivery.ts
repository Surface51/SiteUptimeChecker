import type { NotificationDelivery, NotificationRow, NotificationSettings, NotificationType } from '#shared/types'

type Surfaced = Exclude<NotificationDelivery, 'off' | 'feed'>

const RANK: Record<NotificationDelivery, number> = { off: 0, feed: 1, toast: 2, desktop: 3 }

/** Types that break through quiet hours — being woken for these is the point of an uptime monitor. */
const BREAKS_QUIET: ReadonlySet<NotificationType> = new Set(['down', 'flapping'])

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Whether `now` (local time) falls inside the quiet window, which may wrap past midnight. */
export function isQuietNow(quiet: NotificationSettings['quietHours'], now: Date): boolean {
  if (!quiet.enabled) return false
  const start = minutesOf(quiet.start)
  const end = minutesOf(quiet.end)
  if (start === end) return false
  const cur = now.getHours() * 60 + now.getMinutes()
  return start < end ? cur >= start && cur < end : cur >= start || cur < end
}

export interface DeliveryPlan {
  individual: { notification: NotificationRow; level: Surfaced }[]
  /** Set instead of `individual` when a burst is big enough to collapse into one alert. */
  summary: { message: string; level: Surfaced; count: number } | null
}

/** Decides what to toast / desktop-notify for the notifications that arrived in one poll. */
export function planDeliveries(
  fresh: readonly NotificationRow[],
  settings: Pick<NotificationSettings, 'quietHours' | 'groupBurstsOver'>,
  now: Date,
): DeliveryPlan {
  const quiet = isQuietNow(settings.quietHours, now)
  const surfaced: { notification: NotificationRow; level: Surfaced }[] = []

  for (const notification of fresh) {
    let level: NotificationDelivery = notification.delivery
    if (quiet && !BREAKS_QUIET.has(notification.type) && RANK[level] > RANK[settings.quietHours.allow]) {
      level = settings.quietHours.allow
    }
    if (level === 'toast' || level === 'desktop') surfaced.push({ notification, level })
  }

  if (surfaced.length <= settings.groupBurstsOver) return { individual: surfaced, summary: null }

  const downs = surfaced.filter((s) => s.notification.type === 'down').length
  const message = `${surfaced.length} new alerts${downs ? ` — ${downs} down` : ''}`
  const level: Surfaced = surfaced.some((s) => s.level === 'desktop') ? 'desktop' : 'toast'
  return { individual: [], summary: { message, level, count: surfaced.length } }
}
