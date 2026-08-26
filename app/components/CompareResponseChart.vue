<script setup lang="ts">
import type { CompareRow } from '#shared/types'
import { chartColors, comparePalette, parseDbTime, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ rows: CompareRow[] }>()

function hostname(row: CompareRow) {
  try {
    return new URL(row.site.url).hostname
  } catch {
    return row.site.url
  }
}

const hasData = computed(() => props.rows.some((r) => r.series.length > 0))

const option = computed<EChartsOption>(() => {
  const palette = comparePalette()
  return {
  grid: { left: 48, right: 16, top: 32, bottom: 56 },
  legend: { top: 0, textStyle: { fontSize: 11 } },
  xAxis: { type: 'time' },
  yAxis: { type: 'value', name: 'ms', axisLabel: { formatter: '{value}ms' } },
  dataZoom: [
    { type: 'inside' },
    { type: 'slider', height: 16, bottom: 8, borderColor: chartColors.axisLine, fillerColor: 'rgba(0,0,0,0.06)' },
  ],
  tooltip: {
    trigger: 'axis',
    valueFormatter: (v: number | string | null) => (v === null || v === undefined ? '—' : `${Math.round(Number(v))} ms`),
  },
  series: props.rows.map((row, i) => {
    // The registered chart theme sets a default lineStyle/itemStyle color for all
    // line series — the top-level `color` shorthand loses to that default, so the
    // color must be set explicitly on each style object to actually take effect.
    const color = palette[i % palette.length]
    return {
      name: row.site.name || hostname(row),
      type: 'line',
      showSymbol: false,
      lineStyle: { width: 2, color },
      itemStyle: { color },
      data: row.series.map((p) => [parseDbTime(p.checkedAt), p.timeTotal]),
    }
  }),
  }
})
</script>

<template>
  <UiCard>
    <UiSectionHeading class="mb-4">Response time overlay</UiSectionHeading>
    <div v-if="hasData" class="h-72">
      <BaseChart :option="option" />
    </div>
    <div v-else class="flex h-72 items-center justify-center text-sm text-tertiary">No history in this range</div>
  </UiCard>
</template>
