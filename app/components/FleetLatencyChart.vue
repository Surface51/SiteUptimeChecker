<script setup lang="ts">
import type { FleetTrendDay } from '#shared/types'
import { chartColors, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ series: FleetTrendDay[] }>()

const hasData = computed(() => props.series.some((d) => d.p95Ms !== null))

function formatMs(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`
}

const option = computed<EChartsOption>(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'line', lineStyle: { color: chartColors.axisLine } },
    formatter: (params: any) => {
      const day = props.series[params[0].dataIndex]
      if (!day || day.p95Ms === null) return `${params[0].axisValue}<br/>No data`
      return `${day.date}<br/>Worst p95 ${formatMs(day.p95Ms)}`
    },
  },
  grid: { left: 56, right: 16, top: 16, bottom: 24 },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: props.series.map((d) => d.date),
    axisLabel: { formatter: (v: string) => v.slice(5) },
  },
  yAxis: {
    type: 'value',
    min: 0,
    axisLabel: { formatter: (v: number) => formatMs(v) },
  },
  series: [
    {
      type: 'line',
      showSymbol: false,
      lineStyle: { color: chartColors.logAlt, width: 2 },
      itemStyle: { color: chartColors.logAlt },
      data: props.series.map((d) => d.p95Ms),
    },
  ],
}))
</script>

<template>
  <div v-if="hasData" class="h-56">
    <BaseChart :option="option" />
  </div>
  <div v-else class="flex h-56 items-center justify-center text-sm text-tertiary">No data in this range</div>
</template>
