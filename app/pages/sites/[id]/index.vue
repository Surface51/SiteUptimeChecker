<script setup lang="ts">
import type { DailyUptime, HistoryPoint, SlaReport } from '#shared/types'

const route = useRoute()
const id = computed(() => Number(route.params.id))
const { site } = useInjectedSite()

const { data: sla, refresh: refreshSla } = await useFetch<SlaReport | null>(
  () => `/api/sites/${id.value}/sla`,
  { default: () => null },
)

const { data: history, refresh: refreshHistory } = await useFetch<HistoryPoint[]>(
  () => `/api/sites/${id.value}/history`,
  { query: { hours: 24 }, default: () => [] },
)

const { data: dailyUptime, refresh: refreshDaily } = await useFetch<DailyUptime[]>(
  () => `/api/sites/${id.value}/daily`,
  { query: { days: 90 }, default: () => [] },
)

const recentTicks = computed(() => (history.value ?? []).slice(-50))

usePoll(() => {
  refreshSla()
  refreshHistory()
  refreshDaily()
})
</script>

<template>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <SlaPanel v-if="sla" :sla="sla" class="lg:col-span-2" />

    <UiCard>
      <UiSectionHeading as="h3" class="mb-4">Recent checks</UiSectionHeading>
      <UptimeBar :ticks="recentTicks" />
    </UiCard>

    <UiCard>
      <UiSectionHeading as="h3" class="mb-4">Daily uptime (90d)</UiSectionHeading>
      <UptimeCalendar :days="dailyUptime ?? []" />
    </UiCard>

    <UiCard v-if="site?.latestCheck" class="lg:col-span-2">
      <UiSectionHeading as="h3" class="mb-4">Latest check details</UiSectionHeading>
      <CheckDetail :check="site.latestCheck" />
    </UiCard>
    <UiEmptyState v-else icon="pending" class="lg:col-span-2">
      No checks yet — one should land shortly.
    </UiEmptyState>
  </div>
</template>
