<script setup lang="ts">
import type { NotificationRow } from '#shared/types'

const {
  notifications,
  unreadCount,
  markRead,
  markAllRead,
  desktopEnabled,
  enableDesktopNotifications,
  disableDesktopNotifications,
} = useNotifications()

const open = ref(false)

function toggle() {
  open.value = !open.value
}
function close() {
  open.value = false
}

async function onNotificationClick(n: NotificationRow) {
  if (!n.read) await markRead(n.id)
  close()
  await navigateTo(`/sites/${n.siteId}`)
}

async function toggleDesktop() {
  if (desktopEnabled.value) {
    disableDesktopNotifications()
  } else {
    const granted = await enableDesktopNotifications()
    if (!granted) {
      alert('Desktop notifications were not granted. Check your browser\'s notification permission for this site.')
    }
  }
}

const typeIcon: Record<string, string> = {
  down: '🔴',
  up: '🟢',
  degraded: '🟡',
  ssl_expiring: '🔒',
  lighthouse_regression: '📉',
}

function formatRelative(iso: string) {
  const t = new Date(`${iso.replace(' ', 'T')}Z`).getTime()
  const diffSec = Math.round((Date.now() - t) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`
  return `${Math.round(diffSec / 86400)}d ago`
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="relative rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      @click="toggle"
    >
      <span class="text-lg">🔔</span>
      <span
        v-if="unreadCount > 0"
        class="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-medium text-white"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>

    <div v-if="open" class="fixed inset-0 z-10" @click="close" />

    <div v-if="open" class="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-slate-800 bg-slate-900 shadow-xl">
      <div class="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <span class="text-sm font-medium text-slate-200">Notifications</span>
        <div class="flex items-center gap-2">
          <button type="button" class="text-xs text-slate-500 hover:text-slate-300" @click="toggleDesktop">
            {{ desktopEnabled ? 'Desktop: on' : 'Enable desktop' }}
          </button>
          <button
            v-if="unreadCount > 0"
            type="button"
            class="text-xs text-sky-400 hover:text-sky-300"
            @click="markAllRead"
          >
            Mark all read
          </button>
        </div>
      </div>

      <div class="max-h-96 overflow-y-auto">
        <div v-if="!notifications.length" class="p-4 text-center text-sm text-slate-500">No notifications yet</div>
        <button
          v-for="n in notifications"
          :key="n.id"
          type="button"
          class="flex w-full gap-2 border-b border-slate-800/60 px-3 py-2.5 text-left last:border-0 hover:bg-slate-800/50"
          :class="n.read ? 'opacity-60' : ''"
          @click="onNotificationClick(n)"
        >
          <span class="mt-0.5">{{ typeIcon[n.type] || '•' }}</span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm text-slate-200">{{ n.message }}</div>
            <div class="text-xs text-slate-500">{{ formatRelative(n.createdAt) }}</div>
          </div>
          <span v-if="!n.read" class="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-400" />
        </button>
      </div>
    </div>
  </div>
</template>
