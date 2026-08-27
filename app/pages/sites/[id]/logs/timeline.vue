<script setup lang="ts">
import type { IncidentRow, MaintenanceWindowRow } from '#shared/types'
import { chartColors, parseDbTime, type EChartsOption } from '~/utils/echarts'
import { formatCount, logTimeMs } from '~/utils/logFormat'

const route = useRoute()
const id = computed(() => Number(route.params.id))

const { data: timeline } = useLogView<{ interval: string; series: any[] }>('timeline', () => ({
  interval: '',
  series: [],
}))

// This app's own uptime record, overlaid on the log signals — the point of having both in one
// place. Incidents come from SQLite as UTC strings without an offset, hence parseDbTime.
const { data: incidents } = await useFetch<IncidentRow[]>(() => `/api/sites/${id.value}/incidents`, {
  default: () => [],
  server: false,
})

const { data: maintenance } = await useFetch<MaintenanceWindowRow[]>(
  () => `/api/sites/${id.value}/maintenance`,
  { default: () => [], server: false },
)

const overlayAreas = computed(() => {
  const areas: [Record<string, any>, Record<string, any>][] = []
  for (const incident of incidents.value ?? []) {
    areas.push([
      {
        xAxis: parseDbTime(incident.startedAt),
        itemStyle: { color: chartColors.down, opacity: 0.14 },
      },
      { xAxis: incident.endedAt ? parseDbTime(incident.endedAt) : Date.now() },
    ])
  }
  for (const window of maintenance.value ?? []) {
    areas.push([
      {
        xAxis: new Date(window.startsAt).getTime(),
        itemStyle: { color: chartColors.maint, opacity: 0.14 },
      },
      { xAxis: new Date(window.endsAt).getTime() },
    ])
  }
  return areas
})

// Five signals from five different log files. Drawn as small multiples on one shared time axis
// rather than five overlaid lines: the question is whether spikes line up, which is far easier
// to read stacked, and it avoids inventing five hues this design system doesn't have.
const ROWS = [
  { name: '5xx', label: 'HTTP 5xx', source: 'nginx access', color: () => chartColors.down },
  { name: 'php_errors', label: 'PHP errors', source: 'php-error.log', color: () => chartColors.logAlt },
  { name: 'fpm_slow_exec', label: 'FPM slow requests', source: 'php-fpm-error.log', color: () => chartColors.logAlt },
  { name: 'slow_queries', label: 'MySQL slow queries', source: 'mysqld-slow-query.log', color: () => chartColors.logAlt },
  { name: 'worker_alerts', label: 'nginx worker alerts', source: 'nginx error', color: () => chartColors.logAlt },
]

const byRow = computed(() => {
  const map = new Map<string, [number, number][]>()
  for (const row of ROWS) map.set(row.name, [])
  for (const point of timeline.value?.series ?? []) {
    map.get(point.series)?.push([logTimeMs(point.bucket), Number(point.value)])
  }
  for (const points of map.values()) points.sort((a, b) => a[0] - b[0])
  return map
})

const hasData = computed(() => (timeline.value?.series?.length ?? 0) > 0)

/** One chart per signal, all sharing an x-axis domain so rows line up vertically. */
const domain = computed<[number, number] | null>(() => {
  let min = Infinity
  let max = -Infinity
  for (const points of byRow.value.values()) {
    for (const [t] of points) {
      if (t < min) min = t
      if (t > max) max = t
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : null
})

function rowOption(name: string, color: string, showAxis: boolean): EChartsOption {
  return {
    grid: { left: 64, right: 16, top: 8, bottom: showAxis ? 24 : 6 },
    xAxis: {
      type: 'time',
      min: domain.value?.[0],
      max: domain.value?.[1],
      axisLabel: { show: showAxis },
      axisTick: { show: showAxis },
    },
    yAxis: {
      type: 'value',
      splitNumber: 2,
      axisLabel: { formatter: (v: number) => formatCount(v) },
    },
    // A single series per row, so the row's own label carries identity — no legend needed.
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: number | null) => (value === null ? '—' : formatCount(Number(value))),
    },
    series: [
      {
        type: 'bar',
        data: byRow.value.get(name) ?? [],
        itemStyle: { color },
        // A signal with only a handful of events over a long span would otherwise draw bars
        // wide enough to read as filled blocks rather than moments in time.
        barMaxWidth: 10,
        large: true,
        // Uptime incidents and maintenance windows shaded behind every row, so a log spike can
        // be read directly against whether the site was actually down at the time.
        markArea: { silent: true, data: overlayAreas.value },
      },
    ],
  }
}
</script>

<template>
  <UiCard>
    <div class="flex flex-col gap-4">
      <UiSectionHeading as="h3">
        Correlation timeline
        <template #actions>
          <span class="text-xs text-tertiary">bucketed by {{ timeline?.interval || 'auto' }}</span>
        </template>
      </UiSectionHeading>

      <p class="-mt-2 text-sm text-secondary">
        Five signals from different log files on one shared time axis. Spikes that line up
        vertically are the ones worth chasing.
        <template v-if="overlayAreas.length">
          Shaded bands are this site's own
          <span class="text-down">incidents</span> and
          <span class="text-maint">maintenance windows</span>.
        </template>
      </p>

      <div v-if="hasData" class="flex flex-col">
        <div
          v-for="(row, index) in ROWS"
          :key="row.name"
          class="grid grid-cols-[140px_1fr] items-center gap-2 border-b border-border-default py-1 last:border-b-0"
        >
          <div class="flex flex-col">
            <span class="text-xs font-semibold text-primary">{{ row.label }}</span>
            <span class="text-[10px] text-tertiary">{{ row.source }}</span>
          </div>
          <div class="h-20">
            <BaseChart :option="rowOption(row.name, row.color(), index === ROWS.length - 1)" />
          </div>
        </div>
      </div>

      <div v-else class="flex h-64 items-center justify-center text-sm text-tertiary">
        Nothing recorded across these logs in this range
      </div>
    </div>
  </UiCard>
</template>
