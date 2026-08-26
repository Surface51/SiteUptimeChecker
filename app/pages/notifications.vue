<script setup lang="ts">
import type { NotificationRow, NotificationType } from '#shared/types'

useHead({ title: 'Notifications — Site Uptime' })

const { sites } = useSites()

// These three actions used to live in the header's NotificationBell dropdown,
// which the sidebar redesign replaced with a plain unread badge.
const {
  markAllRead,
  dismissAll,
  desktopEnabled,
  enableDesktopNotifications,
  disableDesktopNotifications,
} = useNotifications()

const TYPE_OPTIONS: { label: string; value: NotificationType | '' }[] = [
  { label: 'All types', value: '' },
  { label: 'Down', value: 'down' },
  { label: 'Back up', value: 'up' },
  { label: 'Degraded', value: 'degraded' },
  { label: 'SSL expiring', value: 'ssl_expiring' },
  { label: 'Lighthouse regression', value: 'lighthouse_regression' },
]

const READ_OPTIONS = [
  { label: 'All', value: 'all' as const },
  { label: 'Unread only', value: 'unread' as const },
]

const siteId = ref<number | ''>('')
const type = ref<NotificationType | ''>('')
const readFilter = ref<'all' | 'unread'>('all')

const query = computed(() => ({
  includeDismissed: 'true',
  limit: 200,
  ...(siteId.value !== '' ? { siteId: siteId.value } : {}),
  ...(type.value !== '' ? { type: type.value } : {}),
  ...(readFilter.value === 'unread' ? { unreadOnly: 'true' } : {}),
}))

const { data: notifications, refresh, pending } = useFetch<NotificationRow[]>('/api/notifications', {
  query,
  default: () => [],
})

async function onNotificationClick(n: NotificationRow) {
  if (!n.read) {
    await $fetch(`/api/notifications/${n.id}/read`, { method: 'POST' })
    notifications.value = (notifications.value ?? []).map((row) => (row.id === n.id ? { ...row, read: true } : row))
  }
  await navigateTo(`/sites/${n.siteId}`)
}

async function onMarkAllRead() {
  await markAllRead()
  await refresh()
}

async function onClearAll() {
  await dismissAll()
  await refresh()
}

function toggleDesktop() {
  if (desktopEnabled.value) disableDesktopNotifications()
  else enableDesktopNotifications()
}
</script>

<template>
  <div class="flex flex-col gap-9">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-4xl font-bold tracking-tight text-primary">Notifications</h1>
        <p class="mt-1.5 text-base text-secondary">Full history across all monitored sites.</p>
      </div>
      <div class="flex flex-wrap gap-2.5">
        <UiButton
          variant="ghost"
          :icon="desktopEnabled ? 'notifications_active' : 'notifications_off'"
          @click="toggleDesktop"
        >
          {{ desktopEnabled ? 'Desktop on' : 'Enable desktop' }}
        </UiButton>
        <UiButton variant="ghost" icon="clear_all" @click="onClearAll">Clear</UiButton>
        <UiButton variant="secondary" icon="done_all" @click="onMarkAllRead">Mark all read</UiButton>
      </div>
    </div>

    <UiCard>
      <div class="flex flex-wrap items-end gap-4">
        <div class="w-52">
          <UiSelect
            v-model="siteId"
            label="Site"
            :options="[
              { label: 'All sites', value: '' },
              ...sites.map((s) => ({ label: s.name || s.url, value: s.id })),
            ]"
          />
        </div>
        <div class="w-52">
          <UiSelect v-model="type" label="Type" :options="TYPE_OPTIONS" />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-secondary">Status</span>
          <UiSegmentedControl v-model="readFilter" :options="READ_OPTIONS" />
        </div>
        <div class="ml-auto">
          <UiButton variant="ghost" icon="refresh" @click="() => refresh()">Refresh</UiButton>
        </div>
      </div>
    </UiCard>

    <div class="overflow-hidden rounded-lg border border-border-default bg-raised">
      <div v-if="pending && !notifications.length" class="p-10 text-center text-sm text-tertiary">Loading…</div>
      <div v-else-if="!notifications.length" class="p-10 text-center text-sm text-tertiary">
        No notifications match these filters.
      </div>
      <button
        v-for="n in notifications"
        :key="n.id"
        type="button"
        class="flex w-full cursor-pointer items-center gap-3.5 border-b border-border-default px-6 py-4.5 text-left transition-colors last:border-0 hover:bg-sunken"
        :class="n.read ? 'bg-transparent' : 'bg-sunken'"
        @click="onNotificationClick(n)"
      >
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          :class="notificationToneClass[n.type]"
        >
          <UiIcon :name="notificationTypeIcon[n.type] || 'notifications'" :size="18" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm text-primary" :class="n.read ? 'font-normal' : 'font-semibold'">
            {{ n.message }}
          </span>
          <span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary">
            <span>{{ n.siteName || n.siteUrl }}</span>
            <span>·</span>
            <span :title="formatAbsoluteTime(n.createdAt)">{{ formatRelativeTime(n.createdAt) }}</span>
            <span v-if="n.dismissed" class="rounded-full bg-sunken px-2 py-0.5 text-[10px] text-secondary">
              Cleared
            </span>
          </span>
        </span>
        <span v-if="!n.read" class="h-2 w-2 shrink-0 rounded-full bg-accent" />
      </button>
    </div>
  </div>
</template>
