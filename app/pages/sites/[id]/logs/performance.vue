<script setup lang="ts">
import { chartColors, type EChartsOption } from '~/utils/echarts'
import { formatDuration, formatExact, logTimeMs } from '~/utils/logFormat'
import type { LogColumn } from '~/components/logs/DataTable.vue'

interface Percentiles {
  overview: { p50: number | null; p95: number | null; p99: number | null; avg: number | null; max: number | null; count: number }
  series: { bucket: string; p50: number; p95: number; p99: number }[]
}

const { data: perf } = useLogView<Percentiles>('perf/percentiles', () => ({
  overview: { p50: null, p95: null, p99: null, avg: null, max: null, count: 0 },
  series: [],
}))

const { data: endpoints, pending } = useLogView<{ endpoints: any[] }>(
  () => 'perf/endpoints?sort=p95&limit=25',
  () => ({ endpoints: [] }),
)

// Three percentiles of one measure on one scale — a lightness ramp of a single hue, not three
// competing colours, since they're magnitudes of the same thing rather than separate entities.
const option = computed<EChartsOption>(() => {
  const rows = perf.value?.series ?? []
  const bands: { key: 'p50' | 'p95' | 'p99'; label: string; width: number; opacity: number }[] = [
    { key: 'p50', label: 'p50 (median)', width: 2, opacity: 0.35 },
    { key: 'p95', label: 'p95', width: 2, opacity: 0.65 },
    { key: 'p99', label: 'p99', width: 2, opacity: 1 },
  ]

  return {
    grid: { left: 56, right: 16, top: 34, bottom: 28 },
    legend: { top: 0, textStyle: { fontSize: 11 }, itemHeight: 8, itemWidth: 12 },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatDuration(v) } },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: number | null) => (value === null ? '—' : formatDuration(Number(value))),
    },
    series: bands.map((band) => ({
      name: band.label,
      type: 'line',
      showSymbol: false,
      data: rows.map((row) => [logTimeMs(row.bucket), row[band.key]]),
      lineStyle: { width: band.width, color: chartColors.logAlt, opacity: band.opacity },
      itemStyle: { color: chartColors.logAlt, opacity: band.opacity },
    })),
  }
})

const columns: LogColumn[] = [
  { key: 'path_pattern', label: 'Endpoint', mono: true },
  { key: 'requests', label: 'Requests', numeric: true, format: formatExact },
  { key: 'p50', label: 'p50', numeric: true, format: formatDuration },
  { key: 'p95', label: 'p95', numeric: true, format: formatDuration },
  { key: 'p99', label: 'p99', numeric: true, format: formatDuration },
  { key: 'total_time', label: 'Total time', numeric: true, format: formatDuration },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <UiCard>
      <div class="grid grid-cols-2 gap-6 sm:grid-cols-5">
        <UiStatBlock :value="formatDuration(perf?.overview.p50)" label="p50" />
        <UiStatBlock :value="formatDuration(perf?.overview.p95)" label="p95" />
        <UiStatBlock :value="formatDuration(perf?.overview.p99)" label="p99" />
        <UiStatBlock :value="formatDuration(perf?.overview.max)" label="Slowest" />
        <UiStatBlock :value="formatExact(perf?.overview.count)" label="Timed requests" />
      </div>
    </UiCard>

    <UiCard>
      <div class="flex flex-col gap-4">
        <UiSectionHeading as="h3">Response time percentiles</UiSectionHeading>
        <div v-if="perf?.series.length" class="h-72">
          <BaseChart :option="option" />
        </div>
        <div v-else class="flex h-72 items-center justify-center text-sm text-tertiary">
          No timed requests in this range
        </div>
      </div>
    </UiCard>

    <LogsDataTable
      title="Slowest endpoints"
      :columns="columns"
      :rows="endpoints?.endpoints ?? []"
      :pending="pending"
      empty="No endpoints with enough requests to rank"
      min-width="720px"
    />
  </div>
</template>
