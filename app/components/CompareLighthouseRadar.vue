<script setup lang="ts">
import type { CompareRow } from '#shared/types'
import { chartColors, comparePalette, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ rows: CompareRow[] }>()

function hostname(row: CompareRow) {
  try {
    return new URL(row.site.url).hostname
  } catch {
    return row.site.url
  }
}

const hasData = computed(() => props.rows.some((r) => r.lighthouse.performance !== null))

const option = computed<EChartsOption>(() => {
  const palette = comparePalette()
  return {
  legend: { top: 0, textStyle: { fontSize: 11 } },
  tooltip: {},
  radar: {
    indicator: [
      { name: 'Performance', max: 100 },
      { name: 'Accessibility', max: 100 },
      { name: 'Best Practices', max: 100 },
      { name: 'SEO', max: 100 },
    ],
    axisName: { color: chartColors.text, fontSize: 10 },
    splitLine: { lineStyle: { color: chartColors.splitLine } },
    axisLine: { lineStyle: { color: chartColors.axisLine } },
    splitArea: { show: false },
  },
  series: [
    {
      type: 'radar',
      data: props.rows.map((row, i) => ({
        name: row.site.name || hostname(row),
        value: [
          row.lighthouse.performance ?? 0,
          row.lighthouse.accessibility ?? 0,
          row.lighthouse.bestPractices ?? 0,
          row.lighthouse.seo ?? 0,
        ],
        lineStyle: { color: palette[i % palette.length] },
        itemStyle: { color: palette[i % palette.length] },
        areaStyle: { color: palette[i % palette.length], opacity: 0.1 },
      })),
    },
  ],
  }
})
</script>

<template>
  <UiCard>
    <UiSectionHeading class="mb-4">Lighthouse (mobile)</UiSectionHeading>
    <div v-if="hasData" class="h-72">
      <BaseChart :option="option" />
    </div>
    <div v-else class="flex h-72 items-center justify-center text-sm text-tertiary">No Lighthouse reports yet</div>
  </UiCard>
</template>
