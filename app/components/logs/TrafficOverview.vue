<script setup lang="ts">
import { chartColors } from '~/utils/echarts'
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatExact,
  formatPercent,
  statusTone,
} from '~/utils/logFormat'
import type { LogColumn } from '~/components/logs/DataTable.vue'

const props = defineProps<{ slug: string; siteId?: number | null }>()

const slug = computed(() => props.slug)
const filters = useLocalLogFilters()

interface Overview {
  requests: number
  unique_visitors: number
  bytes: number
  count_5xx: number
  count_4xx: number
  avg_duration: number | null
  median_duration: number | null
  bot_requests: number
}

const { data: overview, pending: overviewPending } = useLogViewForSlug<Overview>(
  slug,
  filters,
  'traffic/overview',
  () => ({
    requests: 0,
    unique_visitors: 0,
    bytes: 0,
    count_5xx: 0,
    count_4xx: 0,
    avg_duration: null,
    median_duration: null,
    bot_requests: 0,
  }),
)

const { data: timeseries } = useLogViewForSlug<{ interval: string; series: any[] }>(
  slug,
  filters,
  () => 'traffic/timeseries?metric=requests&interval=auto',
  () => ({ interval: '', series: [] }),
)

const { data: statusCodes } = useLogViewForSlug<{ statusCodes: any[] }>(
  slug,
  filters,
  'traffic/status-codes',
  () => ({ statusCodes: [] }),
)

const { data: topPaths, pending: pathsPending } = useLogViewForSlug<{ top: any[] }>(
  slug,
  filters,
  () => 'traffic/top?dim=path&limit=15',
  () => ({ top: [] }),
)

const { data: topIps, pending: ipsPending } = useLogViewForSlug<{ top: any[] }>(
  slug,
  filters,
  () => 'traffic/top?dim=client_ip&limit=15',
  () => ({ top: [] }),
)

const errorRate = computed(() => {
  const total = Number(overview.value?.requests ?? 0)
  if (!total) return 0
  return ((Number(overview.value!.count_4xx) + Number(overview.value!.count_5xx)) / total) * 100
})

const botShare = computed(() => {
  const total = Number(overview.value?.requests ?? 0)
  return total ? (Number(overview.value!.bot_requests) / total) * 100 : 0
})

const requestSeries = computed(() => [
  { name: 'all', label: 'Requests', color: chartColors.primary },
])

const pathColumns: LogColumn[] = [
  { key: 'value', label: 'Path', mono: true },
  { key: 'requests', label: 'Requests', numeric: true, format: formatExact },
  { key: 'error_count', label: 'Errors', numeric: true, format: formatExact },
  { key: 'avg_duration', label: 'Avg', numeric: true, format: formatDuration },
]

const ipColumns: LogColumn[] = [
  { key: 'value', label: 'Client IP', mono: true },
  { key: 'requests', label: 'Requests', numeric: true, format: formatExact },
  { key: 'error_count', label: 'Errors', numeric: true, format: formatExact },
  { key: 'bytes', label: 'Bytes', numeric: true, format: formatBytes },
]

const statusColumns: LogColumn[] = [
  { key: 'status', label: 'Status' },
  { key: 'count', label: 'Requests', numeric: true, format: formatExact },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UiSegmentedControl
        :model-value="filters.range.value"
        :options="LOG_RANGE_PRESETS.map((p) => ({ label: p.label, value: p.value }))"
        @update:model-value="filters.setRange(String($event))"
      />
      <NuxtLink
        v-if="siteId"
        :to="`/sites/${siteId}/logs`"
        class="text-sm text-tertiary no-underline transition-colors hover:text-accent"
      >
        Open full analytics →
      </NuxtLink>
    </div>

    <UiCard>
      <div class="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        <UiStatBlock :value="formatCount(overview?.requests)" label="Requests" />
        <UiStatBlock :value="formatCount(overview?.unique_visitors)" label="Unique visitors" />
        <UiStatBlock :value="formatBytes(overview?.bytes)" label="Bandwidth" />
        <UiStatBlock
          :value="formatPercent(errorRate)"
          label="Error rate"
          :value-class="errorRate > 5 ? 'text-down' : 'text-primary'"
        />
        <UiStatBlock
          :value="formatExact(overview?.count_5xx)"
          label="5xx"
          :value-class="Number(overview?.count_5xx) > 0 ? 'text-down' : 'text-primary'"
        />
        <UiStatBlock :value="formatDuration(overview?.median_duration)" label="Median response" />
      </div>
      <p v-if="overviewPending" class="mt-4 text-xs text-tertiary">Loading…</p>
    </UiCard>

    <UiCard>
      <div class="flex flex-col gap-4">
        <UiSectionHeading as="h3">Requests over time</UiSectionHeading>
        <LogsTimeseriesChart
          :rows="timeseries?.series ?? []"
          :series="requestSeries"
          type="line"
          :value-formatter="formatCount"
        />
      </div>
    </UiCard>

    <div class="grid items-start gap-6 lg:grid-cols-2">
      <LogsDataTable
        title="Top paths"
        :columns="pathColumns"
        :rows="topPaths?.top ?? []"
        :pending="pathsPending"
        min-width="420px"
      />
      <LogsDataTable
        title="Top clients"
        :columns="ipColumns"
        :rows="topIps?.top ?? []"
        :pending="ipsPending"
        min-width="420px"
      >
        <template #cell-value="{ value }">
          <NuxtLink
            v-if="siteId"
            :to="{ path: `/sites/${siteId}/logs/security`, query: { ip: value } }"
            class="font-mono text-xs text-primary no-underline transition-colors hover:text-accent"
          >
            {{ value }}
          </NuxtLink>
          <span v-else class="font-mono text-xs text-primary">{{ value }}</span>
        </template>
      </LogsDataTable>
    </div>

    <div class="grid items-start gap-6 lg:grid-cols-2">
      <LogsDataTable
        title="Status codes"
        :columns="statusColumns"
        :rows="statusCodes?.statusCodes ?? []"
        min-width="320px"
      >
        <template #cell-status="{ value }">
          <UiBadge :tone="statusTone(Number(value))">{{ value }}</UiBadge>
        </template>
      </LogsDataTable>

      <UiCard>
        <div class="flex flex-col gap-4">
          <UiSectionHeading as="h3">Traffic mix</UiSectionHeading>
          <div class="grid grid-cols-2 gap-6">
            <UiStatBlock :value="formatPercent(botShare)" label="Bot share of requests" />
            <UiStatBlock :value="formatCount(overview?.bot_requests)" label="Bot requests" />
          </div>
          <NuxtLink
            v-if="siteId"
            :to="`/sites/${siteId}/logs/bots`"
            class="text-sm text-tertiary no-underline transition-colors hover:text-accent"
          >
            Break down by bot →
          </NuxtLink>
        </div>
      </UiCard>
    </div>
  </div>
</template>
