<script setup lang="ts">
import { chartColors, type EChartsOption } from '~/utils/echarts'
import { logTimeMs } from '~/utils/logFormat'

export interface SeriesSpec {
  /** Value of the `series` column in the API rows. */
  name: string
  label: string
  color: string
}

const props = withDefaults(
  defineProps<{
    /** Long-format rows as every timeseries endpoint returns them. */
    rows: { bucket: string; series: string; value: number }[]
    /**
     * Fixed series order and colors. Declared by the caller rather than derived from the data
     * so a series keeps its color when the data changes — colour follows the entity, not its
     * rank, and a filter that drops a series must not repaint the survivors.
     */
    series: SeriesSpec[]
    type?: 'line' | 'bar'
    stack?: boolean
    height?: string
    valueFormatter?: (value: number) => string
    empty?: string
  }>(),
  { type: 'line', stack: false, height: 'h-72', empty: 'Nothing in this range' },
)

const hasData = computed(() => props.rows.length > 0)

const option = computed<EChartsOption>(() => {
  const byName = new Map<string, [number, number][]>()
  for (const spec of props.series) byName.set(spec.name, [])
  for (const row of props.rows) {
    byName.get(row.series)?.push([logTimeMs(row.bucket), Number(row.value)])
  }
  for (const points of byName.values()) points.sort((a, b) => a[0] - b[0])

  const multi = props.series.length > 1
  const format = props.valueFormatter ?? ((v: number) => v.toLocaleString())

  return {
    grid: { left: 56, right: 16, top: multi ? 34 : 16, bottom: 28 },
    // A legend is always present for two or more series, so identity is never colour alone.
    legend: multi ? { top: 0, textStyle: { fontSize: 11 }, itemHeight: 8, itemWidth: 12 } : undefined,
    xAxis: { type: 'time' },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => format(value) },
    },
    tooltip: {
      // Crosshair on the whole bucket, not per-mark: the point of these charts is comparing
      // series at one instant.
      trigger: 'axis',
      axisPointer: { type: props.type === 'bar' ? 'shadow' : 'line' },
      valueFormatter: (value: number | null) => (value === null ? '—' : format(Number(value))),
    },
    series: props.series.map((spec) => ({
      name: spec.label,
      type: props.type,
      stack: props.stack ? 'total' : undefined,
      showSymbol: false,
      data: byName.get(spec.name) ?? [],
      lineStyle: { width: 2, color: spec.color },
      itemStyle: {
        color: spec.color,
        // A 2px cut in the surface colour keeps stacked segments from bleeding together.
        ...(props.stack && props.type === 'bar'
          ? { borderColor: chartColors.surface, borderWidth: 2 }
          : {}),
      },
      areaStyle: props.type === 'line' && props.stack ? { opacity: 0.5, color: spec.color } : undefined,
    })),
  }
})
</script>

<template>
  <div v-if="hasData" :class="height">
    <BaseChart :option="option" />
  </div>
  <div v-else class="flex items-center justify-center text-sm text-tertiary" :class="height">
    {{ empty }}
  </div>
</template>
