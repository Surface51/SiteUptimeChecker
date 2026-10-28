<script setup lang="ts">
import type { FleetTrendDay } from '#shared/types'
import { chartColors, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ series: FleetTrendDay[] }>()

const total = computed(() => props.series.reduce((sum, d) => sum + d.incidents, 0))

const option = computed<EChartsOption>(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: any) => {
      const day = props.series[params[0].dataIndex]
      if (!day) return ''
      return `${day.date}<br/>${day.incidents} ${day.incidents === 1 ? 'incident' : 'incidents'} started`
    },
  },
  grid: { left: 32, right: 16, top: 16, bottom: 24 },
  xAxis: {
    type: 'category',
    data: props.series.map((d) => d.date),
    axisLabel: { formatter: (v: string) => v.slice(5) },
  },
  yAxis: { type: 'value', minInterval: 1, min: 0 },
  series: [
    {
      type: 'bar',
      barMaxWidth: 14,
      // Rounded data-end only; the baseline end stays square.
      itemStyle: { color: chartColors.down, borderRadius: [4, 4, 0, 0] },
      data: props.series.map((d) => d.incidents),
    },
  ],
}))
</script>

<template>
  <div v-if="total > 0" class="h-56">
    <BaseChart :option="option" />
  </div>
  <div v-else class="flex h-56 items-center justify-center text-sm text-tertiary">
    No incidents in this range
  </div>
</template>
