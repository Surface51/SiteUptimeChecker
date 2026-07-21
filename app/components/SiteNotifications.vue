<script setup lang="ts">
import type { NotificationRow } from '#shared/types'

const props = defineProps<{ notifications: NotificationRow[] }>()

const visibleCount = ref(10)
const visible = computed(() => props.notifications.slice(0, visibleCount.value))
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-medium text-slate-200">Notifications</h2>
      <div class="text-xs text-slate-500">{{ notifications.length }} total</div>
    </div>

    <div v-if="!notifications.length" class="py-6 text-center text-sm text-slate-500">
      No notifications for this site yet.
    </div>

    <ul v-else class="flex flex-col divide-y divide-slate-800 text-sm">
      <li v-for="n in visible" :key="n.id" class="flex items-start gap-2 py-2.5">
        <span class="mt-0.5">{{ notificationTypeIcon[n.type] || '•' }}</span>
        <div class="min-w-0 flex-1">
          <div class="text-slate-200" :class="n.read ? 'opacity-70' : ''">{{ n.message }}</div>
          <div class="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
            <span :title="formatAbsoluteTime(n.createdAt)">{{ formatRelativeTime(n.createdAt) }}</span>
            <span v-if="n.dismissed" class="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              Cleared
            </span>
          </div>
        </div>
      </li>
    </ul>

    <button
      v-if="notifications.length > visibleCount"
      type="button"
      class="mt-3 text-xs text-sky-400 hover:text-sky-300"
      @click="visibleCount += 10"
    >
      Show more
    </button>
  </div>
</template>
