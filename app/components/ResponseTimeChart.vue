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
      { xAxis: parseDbTime(inc.startedAt), itemStyle: { color: chartColors.down, opacity: 0.12 }, name: 'Incident' },
      { xAxis: inc.endedAt ? parseDbTime(inc.endedAt) : Date.now() },
    ])
  }
  for (const win of props.maintenanceWindows ?? []) {
    areas.push([
      { xAxis: new Date(win.startsAt).getTime(), itemStyle: { color: chartColors.maint, opacity: 0.12 }, name: 'Maintenance' },
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
      { type: 'slider', height: 16, bottom: 8, borderColor: chartColors.axisLine, fillerColor: 'rgba(0,0,0,0.06)' },
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
          color: chartColors.accent,
          lineStyle: { width: 2 },
          markLine: {
            symbol: 'none',
            silent: true,
            lineStyle: { color: chartColors.degraded, type: 'dashed' },
            label: { formatter: 'Degraded threshold', color: chartColors.degraded, fontSize: 10 },
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
          itemStyle: { color: chartColors.down },
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
    // Light-to-dark neutral ramp with the accent on the dominant phase, per the
    // design system's connection-phase treatment.
    color: [chartColors.extra2, chartColors.extra1, chartColors.primary, chartColors.accent, chartColors.maint][i],
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
    <div class="ml-auto w-fit">
      <UiSegmentedControl
        v-model="mode"
        :options="[
          { label: 'Total', value: 'total' },
          { label: 'Breakdown', value: 'breakdown' },
        ]"
      />
    </div>
    <div v-if="points.length" class="h-72">
      <BaseChart :option="option" />
    </div>
    <div v-else class="flex h-72 items-center justify-center text-sm text-tertiary">
      No history in this range
    </div>
  </div>
</template>
