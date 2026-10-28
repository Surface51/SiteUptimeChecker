import type { NotificationSettings } from '#shared/types'
import { DEFAULT_NOTIFICATION_SETTINGS } from '#shared/notificationSettings'

export function useNotificationSettings() {
  const { data, refresh } = useFetch<NotificationSettings>('/api/notification-settings', {
    default: () => structuredClone(DEFAULT_NOTIFICATION_SETTINGS),
  })

  async function save(next: NotificationSettings): Promise<NotificationSettings> {
    const saved = await $fetch<NotificationSettings>('/api/notification-settings', { method: 'PUT', body: next })
    data.value = saved
    return saved
  }

  return { settings: data, refresh, save }
}
