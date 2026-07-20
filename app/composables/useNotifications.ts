import type { NotificationRow } from '#shared/types'

const DESKTOP_PREF_KEY = 'siteUptime.desktopNotifications'

export function useNotifications() {
  const { data, refresh } = useFetch<NotificationRow[]>('/api/notifications', { default: () => [] })

  const unreadCount = computed(() => (data.value ?? []).filter((n) => !n.read).length)
  const desktopEnabled = ref(false)
  const knownIds = new Set<number>()

  function seedKnownIds() {
    for (const n of data.value ?? []) knownIds.add(n.id)
  }

  async function pollAndNotify() {
    await refresh()
    if (!desktopEnabled.value || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      seedKnownIds()
      return
    }
    for (const n of data.value ?? []) {
      if (!knownIds.has(n.id)) {
        knownIds.add(n.id)
        new Notification('Site Uptime', { body: n.message })
      }
    }
  }

  let interval: ReturnType<typeof setInterval> | undefined

  onMounted(async () => {
    desktopEnabled.value = localStorage.getItem(DESKTOP_PREF_KEY) === 'true'
    await refresh()
    seedKnownIds()
    interval = setInterval(pollAndNotify, 30_000)
  })

  onUnmounted(() => {
    if (interval) clearInterval(interval)
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
    const item = (data.value ?? []).find((n) => n.id === id)
    if (item) item.read = true
  }

  async function markAllRead() {
    await $fetch('/api/notifications/read-all', { method: 'POST' })
    for (const n of data.value ?? []) n.read = true
  }

  return {
    notifications: data,
    unreadCount,
    refresh,
    markRead,
    markAllRead,
    desktopEnabled,
    enableDesktopNotifications,
    disableDesktopNotifications,
  }
}
