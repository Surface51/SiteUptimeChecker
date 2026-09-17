import type { NotificationRow, NotificationType } from '#shared/types'

const DESKTOP_PREF_KEY = 'siteUptime.desktopNotifications'
const POLL_MS = 30_000

const TOAST_TYPE: Record<NotificationType, 'success' | 'warning' | 'error'> = {
  up: 'success',
  down: 'error',
  degraded: 'warning',
  ssl_expiring: 'warning',
  lighthouse_regression: 'warning',
  domain_expiring: 'warning',
  nameservers_changed: 'warning',
  ssl_issuer_changed: 'warning',
  content_changed: 'warning',
  log_5xx_spike: 'error',
  log_php_fatal: 'error',
  log_threat_ip: 'warning',
}

// Module-level (singleton) state for the parts that must exist exactly once no matter how many
// components call useNotifications() — AppSidebar (which owns the bell badge for the whole app)
// and the notifications page both do. `data`/`refresh` below stay per-invocation: Nuxt's useFetch
// dedupes by key, so every call with this same URL already shares one underlying data ref. The
// timer and the new-id diffing don't get that for free, though — each call used to start its own
// setInterval and its own knownIds Set, so a fresh notification toasted once per mounted instance.
const desktopEnabled = ref(false)
const knownIds = new Set<number>()
let hasSeeded = false
let refCount = 0
let interval: ReturnType<typeof setInterval> | undefined

export function useNotifications() {
  const { data, refresh } = useFetch<NotificationRow[]>('/api/notifications', { default: () => [] })
  const { push: pushToast } = useToasts()

  const unreadCount = computed(() => (data.value ?? []).filter((n) => !n.read).length)

  function seedKnownIds() {
    for (const n of data.value ?? []) knownIds.add(n.id)
  }

  async function pollAndNotify() {
    await refresh()
    const canDesktopNotify =
      desktopEnabled.value && typeof Notification !== 'undefined' && Notification.permission === 'granted'

    for (const n of data.value ?? []) {
      if (!knownIds.has(n.id)) {
        knownIds.add(n.id)
        // In-app toast fires regardless of desktop-notification permission.
        pushToast(n.message, TOAST_TYPE[n.type] ?? 'info', notificationHref(n))
        if (canDesktopNotify) {
          new Notification('Site Uptime', { body: n.message })
        }
      }
    }
  }

  onMounted(async () => {
    refCount += 1
    desktopEnabled.value = localStorage.getItem(DESKTOP_PREF_KEY) === 'true'

    await refresh()
    if (!hasSeeded) {
      hasSeeded = true
      seedKnownIds()
    }

    if (!interval) {
      interval = setInterval(pollAndNotify, POLL_MS)
    }
  })

  onUnmounted(() => {
    refCount -= 1
    if (refCount <= 0 && interval) {
      clearInterval(interval)
      interval = undefined
    }
  })

  async function enableDesktopNotifications(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false
    const permission = await Notification.requestPermission()
    desktopEnabled.value = permission === 'granted'
    localStorage.setItem(DESKTOP_PREF_KEY, String(desktopEnabled.value))
    return desktopEnabled.value
  }

  function disableDesktopNotifications() {
    desktopEnabled.value = false
    localStorage.setItem(DESKTOP_PREF_KEY, 'false')
  }

  async function markRead(id: number) {
    await $fetch(`/api/notifications/${id}/read`, { method: 'POST' })
    data.value = (data.value ?? []).map((n) => (n.id === id ? { ...n, read: true } : n))
  }

  async function markAllRead() {
    await $fetch('/api/notifications/read-all', { method: 'POST' })
    data.value = (data.value ?? []).map((n) => ({ ...n, read: true }))
  }

  async function dismissAll() {
    await $fetch('/api/notifications/dismiss-all', { method: 'POST' })
    await refresh()
  }

  return {
    notifications: data,
    unreadCount,
    refresh,
    markRead,
    markAllRead,
    dismissAll,
    desktopEnabled,
    enableDesktopNotifications,
    disableDesktopNotifications,
  }
}
