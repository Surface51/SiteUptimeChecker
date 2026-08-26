<script setup lang="ts">
import type { SiteSummary } from '#shared/types'

const props = defineProps<{ sites: SiteSummary[] }>()

const upCount = computed(() => props.sites.filter((s) => s.enabled && s.latestCheck?.status === 'up').length)
const degradedCount = computed(() => props.sites.filter((s) => s.enabled && s.latestCheck?.status === 'degraded').length)
const downCount = computed(() => props.sites.filter((s) => s.enabled && s.latestCheck?.status === 'down').length)
const pausedCount = computed(() => props.sites.filter((s) => !s.enabled).length)

const overallUptime = computed(() => {
  const values = props.sites.map((s) => s.uptime24h).filter((v): v is number => v !== null)
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
})
</script>

<template>
  <UiCard padding="px-8 py-7">
    <div class="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
      <UiStatBlock :value="sites.length" label="Sites monitored" icon="dns" />
      <UiStatBlock :value="upCount" label="Up" icon="check_circle" value-class="text-up" />
      <UiStatBlock :value="degradedCount" label="Degraded" icon="warning" value-class="text-degraded" />
      <UiStatBlock :value="downCount" label="Down" icon="error" value-class="text-down" />
      <UiStatBlock
        :value="overallUptime === null ? '—' : `${overallUptime.toFixed(2)}%`"
        label="Avg uptime (24h)"
        icon="show_chart"
      />
    </div>
    <p v-if="pausedCount" class="mt-5 text-sm text-tertiary">{{ pausedCount }} paused</p>
  </UiCard>
</template>
