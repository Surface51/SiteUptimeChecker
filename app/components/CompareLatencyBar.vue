<script setup lang="ts">
import type { CompareRow } from '#shared/types'
import { chartColors, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ rows: CompareRow[] }>()

function hostname(row: CompareRow) {
  try {
    return new URL(row.site.url).hostname
  } catch {
    return row.site.url
  }
}

// Same subtraction idiom as ResponseTimeChart's breakdown mode: the DB stores each
// phase as cumulative elapsed ms from request start, so consecutive phases are
// subtracted to get each segment's own duration. Averaging commutes with subtraction,
// so applying it to the already-averaged `phases` values here is equivalent to
// averaging each check's individual phase durations.
function phaseDurations(row: CompareRow) {
  const { phases, avgMs } = row
  const dns = phases.dns ?? 0
  const tcp = phases.tcp !== null ? Math.max(0, phases.tcp - dns) : 0
  const tlsBase = phases.tcp ?? dns
  const tls = phases.tls !== null ? Math.max(0, phases.tls - tlsBase) : 0
  const waitBase = phases.tls ?? phases.tcp ?? phases.dns ?? 0
  const wait = phases.ttfb !== null ? Math.max(0, phases.ttfb - waitBase) : 0
  const downloadBase = phases.ttfb ?? waitBase
  const download = avgMs !== null ? Math.max(0, avgMs - downloadBase) : 0
  return { dns, tcp, tls, wait, download }
}

const segments = ['dns', 'tcp', 'tls', 'wait', 'download'] as const
const segmentLabels: Record<(typeof segments)[number], string> = {
  dns: 'DNS',
  tcp: 'Connect',
  tls: 'TLS',
  wait: 'Wait (TTFB)',
  download: 'Download',
}
const segmentColors = [chartColors.sky, chartColors.emerald, chartColors.amber, chartColors.rose, chartColors.slate]

const labels = computed(() => props.rows.map((r) => r.site.name || hostname(r)))
const durations = computed(() => props.rows.map(phaseDurations))

const option = computed<EChartsOption>(() => ({
  grid: { left: 56, right: 16, top: 32, bottom: 40, containLabel: true },
  legend: { top: 0, textStyle: { fontSize: 11 } },
  tooltip: {
    trigger: 'axis',
    valueFormatter: (v: number | string | null) => (v === null || v === undefined ? '—' : `${Math.round(Number(v))} ms`),
  },
  xAxis: { type: 'category', data: labels.value, axisLabel: { fontSize: 10 } },
  yAxis: { type: 'value', name: 'ms', axisLabel: { formatter: '{value}ms' } },
  series: segments.map((key, i) => ({
    name: segmentLabels[key],
    type: 'bar',
    stack: 'total',
    barMaxWidth: 32,
    itemStyle: { color: segmentColors[i] },
    data: durations.value.map((d) => d[key]),
  })),
}))
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
    <h2 class="mb-3 text-sm font-medium text-slate-200">Latency breakdown (avg)</h2>
    <div v-if="rows.length" class="h-64">
      <BaseChart :option="option" />
    </div>
    <div v-else class="flex h-64 items-center justify-center text-sm text-slate-600">No data</div>
  </div>
</template>
