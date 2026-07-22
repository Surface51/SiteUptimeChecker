<script setup lang="ts">
import type { CompareRow } from '#shared/types'
import { chartColors, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ rows: CompareRow[] }>()

const palette = [
  chartColors.sky,
  chartColors.emerald,
  chartColors.amber,
  chartColors.rose,
  chartColors.slate,
  chartColors.violet,
]

function hostname(row: CompareRow) {
  try {
    return new URL(row.site.url).hostname
  } catch {
    return row.site.url
  }
}

const hasData = computed(() => props.rows.some((r) => r.lighthouse.performance !== null))

const option = computed<EChartsOption>(() => ({
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
}))
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
    <h2 class="mb-3 text-sm font-medium text-slate-200">Lighthouse (mobile)</h2>
    <div v-if="hasData" class="h-72">
      <BaseChart :option="option" />
    </div>
    <div v-else class="flex h-72 items-center justify-center text-sm text-slate-600">No Lighthouse reports yet</div>
  </div>
</template>
