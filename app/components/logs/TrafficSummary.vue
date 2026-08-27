<script setup lang="ts">
import { formatBytes, formatCount, formatDuration, formatPercent } from '~/utils/logFormat'

interface Summary {
  requests: number
  uniqueVisitors: number
  bytes: number
  count5xx: number
  errorRate: number
  p95: number | null
  sparkline: number[]
}

const props = defineProps<{ siteId: number }>()

// Returns null for a site with no linked logs, which is the common case — the card simply
// doesn't render rather than showing an empty shell on every site page.
const { data } = await useFetch<Summary | null>(() => `/api/sites/${props.siteId}/logs/summary`, {
  default: () => null,
  server: false,
})
</script>

<template>
  <UiCard v-if="data">
    <div class="flex flex-col gap-4">
      <UiSectionHeading as="h3">
        Log traffic
        <template #actions>
          <NuxtLink
            :to="`/sites/${siteId}/logs`"
            class="text-sm text-tertiary no-underline transition-colors hover:text-accent"
          >
            View logs →
          </NuxtLink>
        </template>
      </UiSectionHeading>

      <div class="flex flex-wrap items-start justify-between gap-6">
        <div class="grid flex-1 grid-cols-2 gap-6 sm:grid-cols-4">
          <UiStatBlock :value="formatCount(data.requests)" label="Requests (24h)" />
          <UiStatBlock :value="formatCount(data.uniqueVisitors)" label="Unique visitors" />
          <UiStatBlock
            :value="formatPercent(data.errorRate)"
            label="Error rate"
            :value-class="data.errorRate > 5 ? 'text-down' : 'text-primary'"
          />
          <UiStatBlock :value="formatDuration(data.p95)" label="p95 response" />
        </div>

        <div class="flex flex-col items-end gap-1">
          <Sparkline :points="data.sparkline" :width="160" :height="40" />
          <span class="text-xs text-tertiary">requests per hour · {{ formatBytes(data.bytes) }}</span>
        </div>
      </div>
    </div>
  </UiCard>
</template>
