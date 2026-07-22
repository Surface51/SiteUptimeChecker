<script setup lang="ts">
import { chartColors, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ value: number | null; label: string }>()

const option = computed<EChartsOption>(() => ({
  series: [
    {
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 100,
      radius: '95%',
      center: ['50%', '65%'],
      progress: { show: true, width: 10 },
      itemStyle: { color: chartColors.sky },
      axisLine: {
        lineStyle: {
          width: 10,
          color: [
            [0.95, chartColors.rose],
            [0.99, chartColors.amber],
            [1, chartColors.emerald],
          ],
        },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: { show: false },
      anchor: { show: false },
      title: { show: false },
      detail: {
        valueAnimation: false,
        formatter: (value: number) => `${value.toFixed(2)}%`,
        color: chartColors.textStrong,
        fontSize: 18,
        fontWeight: 600,
        offsetCenter: [0, '-8%'],
      },
      data: [{ value: props.value !== null ? Math.round(props.value * 100) / 100 : 0 }],
    },
  ],
}))
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-2">
    <div class="px-2 pt-2 text-xs text-slate-500">{{ label }}</div>
    <div v-if="value !== null" class="h-20">
      <BaseChart :option="option" />
    </div>
    <div v-else class="flex h-20 items-center justify-center text-2xl font-semibold text-slate-100">—</div>
  </div>
</template>
