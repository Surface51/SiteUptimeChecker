<script setup lang="ts">
import type { FleetTrendDay } from '#shared/types'
import { chartColors, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ series: FleetTrendDay[] }>()

const hasData = computed(() => props.series.some((d) => d.uptime !== null))

// Uptime lives in the top few percent, so a 0-based axis would flatten every dip. Zoom the floor
// to just under the worst day instead; a single axis, with downtime minutes in the tooltip.
const floor = computed(() => {
  const values = props.series.map((d) => d.uptime).filter((v): v is number => v !== null)
  if (!values.length) return 0
  return Math.max(0, Math.floor(Math.min(...values) - 0.5))
})

const option = computed<EChartsOption>(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'line', lineStyle: { color: chartColors.axisLine } },
    formatter: (params: any) => {
      const day = props.series[params[0].dataIndex]
      if (!day || day.uptime === null) return `${params[0].axisValue}<br/>No data`
      const lines = [day.date, `${day.uptime.toFixed(2)}% uptime (${day.total} checks)`]
      if (day.downSeconds > 0) {
        const mins = day.downSeconds / 60
        lines.push(mins >= 60 ? `${(mins / 60).toFixed(1)}h of downtime` : `${Math.round(mins)} min of downtime`)
      }
      return lines.join('<br/>')
    },
  },
  grid: { left: 48, right: 16, top: 16, bottom: 24 },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: props.series.map((d) => d.date),
    axisLabel: { formatter: (v: string) => v.slice(5) },
  },
  yAxis: {
    type: 'value',
    min: floor.value,
    max: 100,
    axisLabel: { formatter: (v: number) => `${v}%` },
  },
  series: [
    {
      type: 'line',
      showSymbol: false,
      lineStyle: { color: chartColors.primary, width: 2 },
      itemStyle: { color: chartColors.primary },
      areaStyle: { color: chartColors.primary, opacity: 0.06 },
      data: props.series.map((d) => d.uptime),
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
