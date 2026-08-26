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
      progress: { show: true, width: 7 },
      itemStyle: { color: chartColors.primary },
      axisLine: {
        lineStyle: {
          width: 7,
          color: [
            [0.95, chartColors.down],
            [0.99, chartColors.degraded],
            [1, chartColors.up],
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
        fontSize: 15,
        fontWeight: 600,
        offsetCenter: [0, '-8%'],
      },
      data: [{ value: props.value !== null ? Math.round(props.value * 100) / 100 : 0 }],
    },
  ],
}))
</script>

<template>
  <UiCard padding="p-3">
    <div class="px-1 text-xs text-tertiary">{{ label }}</div>
    <div v-if="value !== null" class="h-24">
      <BaseChart :option="option" />
    </div>
    <div v-else class="flex h-24 items-center justify-center font-display text-2xl font-bold text-primary">—</div>
  </UiCard>
</template>
