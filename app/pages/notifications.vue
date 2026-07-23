<script setup lang="ts">
import type { NotificationRow, NotificationType } from '#shared/types'

useHead({ title: 'Notifications — Site Uptime' })

const { sites } = useSites()

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
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-lg font-semibold text-slate-100">Notifications</h1>
        <p class="text-sm text-slate-500">Full history across all monitored sites.</p>
      </div>
      <NuxtLink to="/" class="text-sm text-slate-500 hover:text-slate-300">← Back to dashboard</NuxtLink>
    </div>

    <div class="flex flex-wrap gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div>
        <label class="mb-1 block text-xs text-slate-500">Site</label>
        <select
          v-model="siteId"
          class="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
        >
          <option value="">All sites</option>
          <option v-for="s in sites" :key="s.id" :value="s.id">{{ s.name || s.url }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Type</label>
        <select
          v-model="type"
          class="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
        >
          <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Status</label>
        <div class="flex gap-1 rounded-md border border-slate-800 p-0.5 text-xs">
          <button
            v-for="opt in READ_OPTIONS"
            :key="opt.value"
            type="button"
            class="rounded px-2.5 py-1"
            :class="readFilter === opt.value ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
            @click="readFilter = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div class="ml-auto self-end">
        <button
          type="button"
          class="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          @click="() => refresh()"
        >
          Refresh
        </button>
      </div>
    </div>

    <div class="rounded-xl border border-slate-800 bg-slate-900/50">
      <div v-if="pending && !notifications.length" class="p-8 text-center text-sm text-slate-500">Loading…</div>
      <div v-else-if="!notifications.length" class="p-8 text-center text-sm text-slate-500">
        No notifications match these filters.
      </div>
      <button
        v-for="n in notifications"
        :key="n.id"
        type="button"
        class="flex w-full items-start gap-3 border-b border-slate-800/60 px-4 py-3 text-left last:border-0 hover:bg-slate-800/40"
        :class="n.read ? 'opacity-70' : ''"
        @click="onNotificationClick(n)"
      >
        <span class="mt-0.5 text-lg">{{ notificationTypeIcon[n.type] || '•' }}</span>
        <div class="min-w-0 flex-1">
          <div class="text-sm text-slate-200">{{ n.message }}</div>
          <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{{ n.siteName || n.siteUrl }}</span>
            <span>·</span>
            <span :title="formatAbsoluteTime(n.createdAt)">{{ formatRelativeTime(n.createdAt) }}</span>
            <span v-if="n.dismissed" class="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              Cleared
            </span>
          </div>
        </div>
        <span v-if="!n.read" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-400" />
      </button>
    </div>
  </div>
</template>
