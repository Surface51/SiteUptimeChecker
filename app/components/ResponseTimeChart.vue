<script setup lang="ts">
import type { HistoryPoint, IncidentRow, MaintenanceWindowRow } from '#shared/types'
import { chartColors, parseDbTime, type EChartsOption } from '../utils/echarts'

const props = defineProps<{
  points: HistoryPoint[]
  degradedMs: number
  incidents?: IncidentRow[]
  maintenanceWindows?: MaintenanceWindowRow[]
}>()

type Mode = 'total' | 'breakdown'
const mode = ref<Mode>('total')

function phaseDurations(p: HistoryPoint) {
  if (p.timeTotal === null) return null
  const dns = p.timeDns ?? 0
  const tcp = p.timeTcp !== null ? Math.max(0, p.timeTcp - dns) : 0
  const tlsBase = p.timeTcp ?? dns
  const tls = p.timeTls !== null ? Math.max(0, p.timeTls - tlsBase) : 0
  const waitBase = p.timeTls ?? p.timeTcp ?? p.timeDns ?? 0
  const wait = p.timeTtfb !== null ? Math.max(0, p.timeTtfb - waitBase) : 0
  const downloadBase = p.timeTtfb ?? waitBase
  const download = Math.max(0, p.timeTotal - downloadBase)
  return { dns, tcp, tls, wait, download }
}

// markArea data: pairs of [start, end] points, each pair can carry its own itemStyle.
const overlayAreas = computed(() => {
  const areas: [Record<string, any>, Record<string, any>][] = []
  for (const inc of props.incidents ?? []) {
    areas.push([
      { xAxis: parseDbTime(inc.startedAt), itemStyle: { color: 'rgba(251,113,133,0.12)' }, name: 'Incident' },
      { xAxis: inc.endedAt ? parseDbTime(inc.endedAt) : Date.now() },
    ])
  }
  for (const win of props.maintenanceWindows ?? []) {
    areas.push([
      { xAxis: new Date(win.startsAt).getTime(), itemStyle: { color: 'rgba(56,189,248,0.10)' }, name: 'Maintenance' },
      { xAxis: new Date(win.endsAt).getTime() },
    ])
  }
  return areas
})

const option = computed<EChartsOption>(() => {
  const base: EChartsOption = {
    grid: { left: 48, right: 16, top: 16, bottom: 56 },
    xAxis: { type: 'time' },
    dataZoom: [
      { type: 'inside' },
      { type: 'slider', height: 16, bottom: 8, borderColor: chartColors.axisLine, fillerColor: 'rgba(56,189,248,0.15)' },
    ],
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: number | string | null) =>
        value === null || value === undefined ? '—' : `${Math.round(Number(value))} ms`,
    },
  }

  if (mode.value === 'total') {
    const downPoints = props.points.filter((p) => p.status === 'down' && p.timeTotal !== null)
    return {
      ...base,
      yAxis: { type: 'value', name: 'ms', axisLabel: { formatter: '{value}ms' } },
      series: [
        {
          name: 'Response time',
          type: 'line',
          showSymbol: false,
          data: props.points.map((p) => [parseDbTime(p.checkedAt), p.timeTotal]),
          color: chartColors.sky,
          lineStyle: { width: 2 },
          markLine: {
            symbol: 'none',
            silent: true,
            lineStyle: { color: chartColors.amber, type: 'dashed' },
            label: { formatter: 'Degraded threshold', color: chartColors.amber, fontSize: 10 },
            data: [{ yAxis: props.degradedMs }],
          },
          markArea: {
            silent: true,
            data: overlayAreas.value,
          },
        },
        {
          name: 'Down',
          type: 'scatter',
          symbolSize: 8,
          itemStyle: { color: chartColors.rose },
          data: downPoints.map((p) => [parseDbTime(p.checkedAt), p.timeTotal]),
        },
      ],
    }
  }

  const phases = props.points.map((p) => ({ checkedAt: p.checkedAt, phases: phaseDurations(p) }))
  const series = ['dns', 'tcp', 'tls', 'wait', 'download'].map((key, i) => ({
    name: { dns: 'DNS', tcp: 'Connect', tls: 'TLS', wait: 'Wait (TTFB)', download: 'Download' }[key],
    type: 'line',
    stack: 'total',
    areaStyle: { opacity: 0.55 },
    showSymbol: false,
    lineStyle: { width: 1 },
    color: [chartColors.sky, chartColors.emerald, chartColors.amber, chartColors.rose, chartColors.slate][i],
    data: phases.map((p) => [parseDbTime(p.checkedAt), p.phases ? p.phases[key as keyof NonNullable<typeof p.phases>] : null]),
  }))

  return {
    ...base,
    legend: { top: 0, textStyle: { fontSize: 11 } },
    grid: { ...base.grid, top: 32 },
    yAxis: { type: 'value', name: 'ms', axisLabel: { formatter: '{value}ms' } },
    series,
  }
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex justify-end gap-1 rounded-md border border-slate-800 p-0.5 text-xs w-fit ml-auto">
      <button
        type="button"
        class="rounded px-2 py-1"
        :class="mode === 'total' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
        @click="mode = 'total'"
      >
        Total
      </button>
      <button
        type="button"
        class="rounded px-2 py-1"
        :class="mode === 'breakdown' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
        @click="mode = 'breakdown'"
      >
        Breakdown
      </button>
    </div>
    <div v-if="points.length" class="h-72">
      <BaseChart :option="option" />
    </div>
    <div v-else class="flex h-72 items-center justify-center text-sm text-slate-600">
      No history in this range
    </div>
  </div>
</template>
