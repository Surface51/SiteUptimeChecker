<script setup lang="ts">
import type { NotificationRow } from '#shared/types'

const props = defineProps<{ notifications: NotificationRow[] }>()

const visibleCount = ref(10)
const visible = computed(() => props.notifications.slice(0, visibleCount.value))
</script>

<template>
  <UiCard>
    <UiSectionHeading as="h3" class="mb-4">
      Notifications
      <template #actions>
        <span class="text-xs text-tertiary">{{ notifications.length }} total</span>
      </template>
    </UiSectionHeading>

    <div v-if="!notifications.length" class="py-6 text-center text-sm text-tertiary">
      No notifications for this site yet.
    </div>

    <ul v-else class="flex flex-col divide-y divide-border-default text-sm">
      <li v-for="n in visible" :key="n.id" class="flex items-start gap-3 py-3">
        <span
          class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          :class="notificationToneClass[n.type]"
        >
          <UiIcon :name="notificationTypeIcon[n.type] || 'notifications'" :size="15" />
        </span>
        <div class="min-w-0 flex-1">
          <div :class="n.read ? 'text-secondary' : 'font-medium text-primary'">{{ n.message }}</div>
          <div class="mt-0.5 flex items-center gap-2 text-xs text-tertiary">
            <span :title="formatAbsoluteTime(n.createdAt)">{{ formatRelativeTime(n.createdAt) }}</span>
            <span v-if="n.dismissed" class="rounded-full bg-sunken px-2 py-0.5 text-[10px] text-secondary">
              Cleared
            </span>
          </div>
        </div>
      </li>
    </ul>

    <button
      v-if="notifications.length > visibleCount"
      type="button"
      class="mt-4 cursor-pointer text-sm text-accent transition-colors hover:text-accent-hover"
      @click="visibleCount += 10"
    >
      Show more
    </button>
  </UiCard>
</template>
