<script setup lang="ts">
import type { SiteSummary } from '#shared/types'
import { formatRelativeTime } from '~/utils/notificationDisplay'

const props = defineProps<{ sites: SiteSummary[] }>()

function hostname(site: SiteSummary) {
  try {
    return new URL(site.url).hostname
  } catch {
    return site.url
  }
}

// Longest-running first — the incident that's been open the longest is the one most overdue for attention.
const openSites = computed(() =>
  props.sites
    .filter((s) => s.openIncident !== null)
    .sort((a, b) => new Date(a.openIncident!.startedAt).getTime() - new Date(b.openIncident!.startedAt).getTime()),
)
</script>

<template>
  <UiCard flush>
    <div class="p-5 pb-0">
      <UiSectionHeading as="h3">
        Open incidents
        <template #actions>
          <span v-if="openSites.length" class="text-xs text-tertiary">{{ openSites.length }} ongoing</span>
        </template>
      </UiSectionHeading>
    </div>

    <div v-if="!openSites.length" class="flex h-24 items-center justify-center text-sm text-tertiary">
      No open incidents
    </div>
    <ul v-else class="mt-3 flex flex-col divide-y divide-border-default">
      <li v-for="site in openSites" :key="site.id">
        <NuxtLink
          :to="`/sites/${site.id}`"
          class="flex items-start gap-3 px-5 py-3 no-underline transition-colors hover:bg-sunken"
        >
          <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-down" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-primary">{{ site.name || hostname(site) }}</span>
            <span class="block truncate text-xs text-tertiary">{{ site.openIncident!.cause || 'Unresponsive' }}</span>
          </span>
          <span class="shrink-0 text-xs text-tertiary">{{ formatRelativeTime(site.openIncident!.startedAt) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </UiCard>
</template>
