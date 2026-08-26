<script setup lang="ts">
import type { CompareRow } from '#shared/types'
import { comparePalette } from '../utils/echarts'

const props = defineProps<{ rows: CompareRow[] }>()

// Same series colors the compare charts use, so the header dots act as a shared legend.
const seriesColors = computed(() => {
  const palette = comparePalette()
  return props.rows.map((_, i) => palette[i % palette.length])
})

function hostname(row: CompareRow) {
  try {
    return new URL(row.site.url).hostname
  } catch {
    return row.site.url
  }
}

function formatPct(v: number | null) {
  return v === null ? '—' : `${v.toFixed(2)}%`
}
function formatMs(v: number | null) {
  return v === null ? '—' : `${Math.round(v)} ms`
}
function formatCount(v: number | null) {
  return v === null ? '—' : String(v)
}
function formatDuration(v: number | null) {
  if (v === null) return '—'
  if (v === 0) return '0s'
  if (v < 60) return `${v}s`
  if (v < 3600) return `${Math.round(v / 60)}m`
  return `${(v / 3600).toFixed(1)}h`
}

interface MetricRow {
  label: string
  values: (number | null)[]
  format: (v: number | null) => string
  better: 'max' | 'min'
}

const metrics = computed<MetricRow[]>(() => [
  { label: 'Uptime 24h', values: props.rows.map((r) => r.uptime24h), format: formatPct, better: 'max' },
  { label: 'Uptime 7d', values: props.rows.map((r) => r.uptime7d), format: formatPct, better: 'max' },
  { label: 'Uptime 30d', values: props.rows.map((r) => r.uptime30d), format: formatPct, better: 'max' },
  { label: 'Avg response', values: props.rows.map((r) => r.avgMs), format: formatMs, better: 'min' },
  { label: 'p95 response', values: props.rows.map((r) => r.p95Ms), format: formatMs, better: 'min' },
  { label: 'Incidents', values: props.rows.map((r) => r.incidents.count), format: formatCount, better: 'min' },
  { label: 'Downtime', values: props.rows.map((r) => r.incidents.totalDownSeconds), format: formatDuration, better: 'min' },
  { label: 'SSL days left', values: props.rows.map((r) => r.sslDaysRemaining), format: formatCount, better: 'max' },
  { label: 'Lighthouse perf', values: props.rows.map((r) => r.lighthouse.performance), format: formatCount, better: 'max' },
])

function bestIndex(values: (number | null)[], better: 'max' | 'min'): number | null {
  const present = values.map((v, i) => (v === null ? null : i)).filter((i): i is number => i !== null)
  if (present.length < 2) return null
  const beats = better === 'max' ? (a: number, b: number) => a > b : (a: number, b: number) => a < b
  return present.reduce((best, i) => (beats(values[i]!, values[best]!) ? i : best), present[0]!)
}

const metricsView = computed(() =>
  metrics.value.map((m) => ({ ...m, bestIdx: bestIndex(m.values, m.better) })),
)
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-border-default bg-raised">
    <table class="w-full min-w-[480px] border-collapse text-sm">
      <thead>
        <tr class="border-b border-border-default text-left">
          <th class="px-4 py-3.5 text-xs font-semibold tracking-wide text-tertiary uppercase">Metric</th>
          <th
            v-for="(row, i) in rows"
            :key="row.site.id"
            class="px-4 py-3.5 text-xs font-semibold tracking-wide text-tertiary uppercase"
          >
            <span class="inline-flex items-center gap-2">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: seriesColors[i] }" />
              <span class="text-primary normal-case">{{ row.site.name || hostname(row) }}</span>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="metric in metricsView" :key="metric.label" class="border-b border-border-default last:border-0">
          <td class="px-4 py-3.5 text-secondary">{{ metric.label }}</td>
          <td
            v-for="(row, i) in rows"
            :key="row.site.id"
            class="px-4 py-3.5 text-right"
            :class="metric.bestIdx === i ? 'font-semibold text-up' : 'text-secondary'"
          >
            {{ metric.format(metric.values[i]!) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
