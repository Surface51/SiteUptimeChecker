<script setup lang="ts">
import type { CompareRow } from '#shared/types'
import { chartColors, parseDbTime, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ rows: CompareRow[] }>()

// Matches the ranking bar / phase-breakdown color idiom used elsewhere in the app,
// with one extra color since compare allows up to 6 sites.
const palette = [
  chartColors.sky,
  chartColors.emerald,
  chartColors.amber,
  chartColors.rose,
  chartColors.slate,
  chartColors.violet,
]

function hostname(row: CompareRow) {
  try {
    return new URL(row.site.url).hostname
  } catch {
    return row.site.url
  }
}

const hasData = computed(() => props.rows.some((r) => r.series.length > 0))

const option = computed<EChartsOption>(() => ({
  grid: { left: 48, right: 16, top: 32, bottom: 56 },
  legend: { top: 0, textStyle: { fontSize: 11 } },
  xAxis: { type: 'time' },
  yAxis: { type: 'value', name: 'ms', axisLabel: { formatter: '{value}ms' } },
  dataZoom: [
    { type: 'inside' },
    { type: 'slider', height: 16, bottom: 8, borderColor: chartColors.axisLine, fillerColor: 'rgba(56,189,248,0.15)' },
  ],
  tooltip: {
    trigger: 'axis',
    valueFormatter: (v: number | string | null) => (v === null || v === undefined ? '—' : `${Math.round(Number(v))} ms`),
  },
  series: props.rows.map((row, i) => ({
    name: row.site.name || hostname(row),
    type: 'line',
    showSymbol: false,
    lineStyle: { width: 2 },
    color: palette[i % palette.length],
    data: row.series.map((p) => [parseDbTime(p.checkedAt), p.timeTotal]),
  })),
}))
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
    <h2 class="mb-3 text-sm font-medium text-slate-200">Response time overlay</h2>
    <div v-if="hasData" class="h-72">
      <BaseChart :option="option" />
    </div>
    <div v-else class="flex h-72 items-center justify-center text-sm text-slate-600">No history in this range</div>
  </div>
</template>
