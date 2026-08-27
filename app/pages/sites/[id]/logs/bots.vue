<script setup lang="ts">
import { chartColors } from '~/utils/echarts'
import { formatBytes, formatCount, formatDuration, formatExact, formatPercent } from '~/utils/logFormat'
import type { LogColumn } from '~/components/logs/DataTable.vue'

const { data: bots, pending } = useLogView<{ summary: any; topBots: any[] }>('bots/overview', () => ({
  summary: { bot_requests: 0, human_requests: 0, bot_time_seconds: 0, bot_bytes: 0 },
  topBots: [],
}))

const { data: timeseries } = useLogView<{ series: any[] }>('bots/timeseries', () => ({ series: [] }))

const { data: crawlers, pending: crawlersPending } = useLogView<{ crawlers: any[] }>(
  'bots/facet-crawlers',
  () => ({ crawlers: [] }),
)

// Two entities, separated by lightness as much as hue: neither is an error state, so red is
// left out and the pair reads clearly even without colour vision.
const botSeries = computed(() => [
  { name: 'human', label: 'Human', color: chartColors.primary },
  { name: 'bot', label: 'Bot', color: chartColors.logAlt },
])

const botShare = computed(() => {
  const bot = Number(bots.value?.summary.bot_requests ?? 0)
  const human = Number(bots.value?.summary.human_requests ?? 0)
  return bot + human ? (bot / (bot + human)) * 100 : 0
})

const botColumns: LogColumn[] = [
  { key: 'bot_name', label: 'Bot' },
  { key: 'requests', label: 'Requests', numeric: true, format: formatExact },
  { key: 'unique_ips', label: 'IPs', numeric: true, format: formatExact },
  { key: 'time_seconds', label: 'Server time', numeric: true, format: formatDuration },
]

const crawlerColumns: LogColumn[] = [
  { key: 'client_ip', label: 'Client IP', mono: true },
  { key: 'facet_crawl_score', label: 'Facet score', numeric: true, format: formatExact },
  { key: 'request_count', label: 'Requests', numeric: true, format: formatExact },
  { key: 'distinct_paths', label: 'Paths', numeric: true, format: formatExact },
  { key: 'bot_name', label: 'Identifies as' },
  { key: 'country', label: 'Country' },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <UiCard>
      <div class="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <UiStatBlock :value="formatPercent(botShare)" label="Bot share" />
        <UiStatBlock :value="formatCount(bots?.summary.bot_requests)" label="Bot requests" />
        <UiStatBlock :value="formatDuration(bots?.summary.bot_time_seconds)" label="Server time on bots" />
        <UiStatBlock :value="formatBytes(bots?.summary.bot_bytes)" label="Bandwidth to bots" />
      </div>
      <p v-if="pending" class="mt-4 text-xs text-tertiary">Loading…</p>
    </UiCard>

    <UiCard>
      <div class="flex flex-col gap-4">
        <UiSectionHeading as="h3">Bot vs human traffic</UiSectionHeading>
        <LogsTimeseriesChart
          :rows="timeseries?.series ?? []"
          :series="botSeries"
          type="line"
          :value-formatter="formatCount"
        />
      </div>
    </UiCard>

    <LogsDataTable
      title="Top bots"
      :columns="botColumns"
      :rows="bots?.topBots ?? []"
      :pending="pending"
      empty="No bot traffic in this range"
      min-width="560px"
    />

    <LogsDataTable
      title="Facet crawlers"
      :columns="crawlerColumns"
      :rows="crawlers?.crawlers ?? []"
      :pending="crawlersPending"
      empty="No facet crawlers detected"
      min-width="720px"
    >
      <template #actions>
        <span class="text-xs text-tertiary">
          Addresses hammering many query-string variants of one page — full history, not this range
        </span>
      </template>
    </LogsDataTable>
  </div>
</template>
