<script setup lang="ts">
import type { DailyUptime } from '#shared/types'
import { chartColors, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ days: DailyUptime[] }>()

const range = computed<[string, string]>(() => {
  if (!props.days.length) {
    const today = new Date().toISOString().slice(0, 10)
    return [today, today]
  }
  return [props.days[0]!.date, props.days[props.days.length - 1]!.date]
})

const option = computed<EChartsOption>(() => ({
  tooltip: {
    formatter: (params: any) => {
      const day: DailyUptime | undefined = props.days.find((d) => d.date === params.data[0])
      if (!day || day.total === 0) return `${params.data[0]}<br/>No data`
      return `${params.data[0]}<br/>${day.uptime?.toFixed(2)}% uptime (${day.total} checks)`
    },
  },
  visualMap: {
    show: false,
    min: 0,
    max: 100,
    inRange: { color: [chartColors.rose, chartColors.amber, chartColors.emerald] },
  },
  calendar: {
    range: range.value,
    cellSize: ['auto', 15],
    left: 24,
    right: 8,
    top: 20,
    bottom: 0,
    yearLabel: { show: false },
    dayLabel: { color: chartColors.text, fontSize: 10, nameMap: 'en' },
    monthLabel: { color: chartColors.text, fontSize: 10 },
    splitLine: { lineStyle: { color: chartColors.axisLine, width: 1 } },
    itemStyle: { borderColor: '#0f172a', borderWidth: 3, color: 'rgba(30,41,59,0.6)' },
  },
  series: {
    type: 'heatmap',
    coordinateSystem: 'calendar',
    data: props.days.map((d) => [d.date, d.total === 0 ? null : d.uptime]),
  },
}))
</script>

<template>
  <div v-if="days.length" class="h-40">
    <BaseChart :option="option" />
  </div>
  <div v-else class="flex h-40 items-center justify-center text-sm text-slate-600">No data yet</div>
</template>
