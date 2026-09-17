<script setup lang="ts">
import type { NotificationRow } from '#shared/types'

const route = useRoute()
const id = computed(() => Number(route.params.id))

interface IncidentResponse {
  notification: NotificationRow
  unavailable: string | null
  ipEvidence: {
    profile: Record<string, unknown> | null
    recentRequests: Record<string, unknown>[]
    topPaths: (Record<string, unknown> & { suspicious: boolean })[]
    requestsPerMinute: { bucket: string; status: string; count: number }[]
  } | null
  logContext: {
    requests: { bucket: string; series: string; value: number }[]
    topPaths: Record<string, unknown>[]
    phpErrors: Record<string, unknown>[]
    fpmEvents: Record<string, unknown>[]
    topIps: Record<string, unknown>[]
  } | null
}

const { data, pending, error } = await useFetch<IncidentResponse>(`/api/notifications/${id.value}/incident`, {
  server: false,
})

useHead({ title: () => (data.value ? `${data.value.notification.message} — Site Uptime` : 'Notification — Site Uptime') })

const notification = computed(() => data.value?.notification ?? null)

watch(
  notification,
  async (n) => {
    if (n && !n.read) {
      await $fetch(`/api/notifications/${n.id}/read`, { method: 'POST' })
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex flex-col gap-6">
    <NuxtLink to="/notifications" class="inline-flex w-fit items-center gap-1.5 text-sm text-secondary no-underline transition-colors hover:text-primary">
      <UiIcon name="arrow_back" :size="16" />
      Back to notifications
    </NuxtLink>

    <p v-if="pending" class="text-sm text-tertiary">Loading…</p>
    <UiEmptyState v-else-if="error" icon="error">
      <p class="text-primary">Couldn't load this notification.</p>
      <p>{{ error.statusMessage || 'It may have been deleted.' }}</p>
    </UiEmptyState>

    <NotificationIncident v-else-if="data" :data="data" />
  </div>
</template>
