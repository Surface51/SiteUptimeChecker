<script setup lang="ts">
import type { NotificationRow } from '#shared/types'

const route = useRoute()
const id = computed(() => Number(route.params.id))

const { data: siteNotifications, refresh: refreshNotifications } = await useFetch<NotificationRow[]>(
  () => `/api/sites/${id.value}/notifications`,
  { default: () => [] },
)

usePoll(() => refreshNotifications())
</script>

<template>
  <div class="flex flex-col gap-6">
    <SiteNotifications :notifications="siteNotifications ?? []" />
    <CheckLog :site-id="id" />
  </div>
</template>
