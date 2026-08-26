<script setup lang="ts">
import type { CompareRow } from '#shared/types'
import { chartColors, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ rows: CompareRow[] }>()

function hostname(row: CompareRow) {
  try {
    return new URL(row.site.url).hostname
  } catch {
    return row.site.url
  }
}

const labels = computed(() => props.rows.map((r) => r.site.name || hostname(r)))

const option = computed<EChartsOption>(() => ({
  grid: { left: 48, right: 16, top: 32, bottom: 40, containLabel: true },
  legend: { top: 0, textStyle: { fontSize: 11 } },
  tooltip: {
    trigger: 'axis',
    valueFormatter: (v: number | string | null) =>
      v === null || v === undefined ? '—' : `${Number(v).toFixed(2)}%`,
  },
  xAxis: { type: 'category', data: labels.value, axisLabel: { fontSize: 10 } },
  yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' } },
  series: [
    { name: '24h', type: 'bar', barMaxWidth: 24, itemStyle: { color: chartColors.primary, borderRadius: [999, 999, 0, 0] }, data: props.rows.map((r) => r.uptime24h) },
    { name: '7d', type: 'bar', barMaxWidth: 24, itemStyle: { color: chartColors.accent, borderRadius: [999, 999, 0, 0] }, data: props.rows.map((r) => r.uptime7d) },
    { name: '30d', type: 'bar', barMaxWidth: 24, itemStyle: { color: chartColors.extra1, borderRadius: [999, 999, 0, 0] }, data: props.rows.map((r) => r.uptime30d) },
  ],
}))
</script>

<template>
  <UiCard>
    <UiSectionHeading class="mb-4">Uptime comparison</UiSectionHeading>
    <div v-if="rows.length" class="h-64">
      <BaseChart :option="option" />
    </div>
    <div v-else class="flex h-64 items-center justify-center text-sm text-tertiary">No data</div>
  </UiCard>
</template>
