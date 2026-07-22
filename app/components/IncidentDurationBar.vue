<script setup lang="ts">
import type { IncidentRow } from '#shared/types'
import { chartColors, parseDbTime, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ incidents: IncidentRow[] }>()

const closed = computed(() =>
  props.incidents
    .filter((i) => i.endedAt !== null && i.durationSeconds !== null)
    .slice()
    .sort((a, b) => parseDbTime(a.startedAt) - parseDbTime(b.startedAt))
    .slice(-20),
)

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(2)}h`
}

const option = computed<EChartsOption>(() => ({
  grid: { left: 48, right: 16, top: 16, bottom: 40 },
  tooltip: {
    trigger: 'axis',
    formatter: (params: any) => {
      const p = params[0]
      return `${formatDuration(p.value[1])}<br/>${new Date(p.value[0]).toLocaleString()}`
    },
  },
  xAxis: { type: 'time' },
  yAxis: { type: 'value', name: 'duration', axisLabel: { formatter: (v: number) => formatDuration(v) } },
  series: [
    {
      type: 'bar',
      barMaxWidth: 20,
      itemStyle: { color: chartColors.rose },
      data: closed.value.map((i) => [parseDbTime(i.startedAt), i.durationSeconds]),
    },
  ],
}))
</script>

<template>
  <div v-if="closed.length" class="h-48">
    <BaseChart :option="option" />
  </div>
</template>
