<script setup lang="ts">
import type { LighthouseReport } from '#shared/types'
import { chartColors, parseDbTime, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ points: LighthouseReport[] }>()

const CATEGORIES = [
  { key: 'performance' as const, label: 'Performance' },
  { key: 'accessibility' as const, label: 'Accessibility' },
  { key: 'bestPractices' as const, label: 'Best Practices' },
  { key: 'seo' as const, label: 'SEO' },
]

const latest = computed(() => {
  for (let i = props.points.length - 1; i >= 0; i--) {
    if (!props.points[i]!.error) return props.points[i]!
  }
  return null
})

const radarOption = computed<EChartsOption>(() => ({
  tooltip: {},
  radar: {
    indicator: CATEGORIES.map((c) => ({ name: c.label, max: 100 })),
    axisName: { color: chartColors.text, fontSize: 10 },
    splitLine: { lineStyle: { color: chartColors.axisLine } },
    splitArea: { show: false },
    axisLine: { lineStyle: { color: chartColors.axisLine } },
  },
  series: [
    {
      type: 'radar',
      areaStyle: { opacity: 0.15 },
      lineStyle: { color: chartColors.accent },
      itemStyle: { color: chartColors.accent },
      data: [
        {
          name: 'Latest scores',
          value: CATEGORIES.map((c) => (latest.value ? latest.value[c.key] ?? 0 : 0)),
        },
      ],
    },
  ],
}))

const trendOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { top: 0, textStyle: { fontSize: 11 } },
  grid: { left: 40, right: 16, top: 32, bottom: 24 },
  xAxis: { type: 'time' },
  yAxis: { type: 'value', min: 0, max: 100 },
  series: CATEGORIES.map((c, i) => {
    // The registered chart theme sets a default lineStyle/itemStyle color for all
    // line series — the top-level `color` shorthand loses to that default, so the
    // color must be set explicitly on each style object to actually take effect.
    const color = [chartColors.primary, chartColors.accent, chartColors.up, chartColors.maint][i]
    return {
      name: c.label,
      type: 'line',
      showSymbol: false,
      connectNulls: true,
      lineStyle: { color },
      itemStyle: { color },
      data: props.points.filter((p) => !p.error).map((p) => [parseDbTime(p.measuredAt), p[c.key]]),
    }
  }),
}))
</script>

<template>
  <div v-if="points.length" class="flex flex-col gap-4 sm:flex-row">
    <div class="h-56 shrink-0 sm:w-56">
      <BaseChart :option="radarOption" />
    </div>
    <div class="h-56 flex-1">
      <BaseChart :option="trendOption" />
    </div>
  </div>
  <div v-else class="flex h-56 items-center justify-center text-sm text-tertiary">No history in this range</div>
</template>
