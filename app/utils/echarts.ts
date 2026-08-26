import { reactive } from 'vue'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import {
  BarChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  PieChart,
  RadarChart,
} from 'echarts/charts'
import {
  CalendarComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import type { CheckStatus } from '#shared/types'

echarts.use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  HeatmapChart,
  RadarChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CalendarComponent,
  VisualMapComponent,
  MarkLineComponent,
  MarkAreaComponent,
  TitleComponent,
])

// Surface 51 chart palettes. These hex values are hand-synced to the CSS tokens
// in app/assets/css/main.css — canvas can't read custom properties, and resolving
// them from JS isn't reliable during SSR. Keep the two maps in step.
type ChartPalette = {
  bg: string
  axisLine: string
  splitLine: string
  text: string
  textStrong: string
  /** Main series color — black in light, white in dark. */
  primary: string
  accent: string
  up: string
  degraded: string
  down: string
  maint: string
  neutral: string
  /** Extra multi-series colors for comparisons. */
  extra1: string
  extra2: string
  tooltipBg: string
  tooltipBorder: string
}

const LIGHT_PALETTE: ChartPalette = {
  bg: 'transparent',
  axisLine: '#dcdcdc', // gray-200
  splitLine: '#ededed', // gray-100
  text: '#8f8f8f', // gray-400
  textStrong: '#000000',
  primary: '#000000',
  accent: '#e4312b', // red-500
  up: '#2f8f4e',
  degraded: '#a86a0e',
  down: '#e4312b',
  maint: '#4a70a8',
  neutral: '#8f8f8f', // gray-400
  extra1: '#5c5c5c', // gray-600
  extra2: '#b8b8b8', // gray-300
  tooltipBg: '#ffffff',
  tooltipBorder: '#dcdcdc',
}

const DARK_PALETTE: ChartPalette = {
  bg: 'transparent',
  axisLine: '#262626', // gray-800
  splitLine: '#262626',
  text: '#5c5c5c', // gray-600
  textStrong: '#ffffff',
  primary: '#ffffff',
  accent: '#f0473f',
  up: '#48b06c',
  degraded: '#d98f1f',
  down: '#f0473f',
  maint: '#7d9cc4',
  neutral: '#5c5c5c',
  extra1: '#b8b8b8', // gray-300
  extra2: '#5c5c5c', // gray-600
  tooltipBg: '#0a0a0a',
  tooltipBorder: '#262626',
}

// Reactive so chart components — which all read these inside computed() — re-render
// when the theme flips. Mutated in place; never destructure it at a call site.
export const chartColors = reactive<ChartPalette>({ ...LIGHT_PALETTE })

export function setChartMode(mode: 'light' | 'dark') {
  Object.assign(chartColors, mode === 'dark' ? DARK_PALETTE : LIGHT_PALETTE)
}

// The DB stores "YYYY-MM-DD HH:MM:SS" (UTC, no offset) — normalize to a real timestamp.
export function parseDbTime(iso: string): number {
  return new Date(`${iso.replace(' ', 'T')}Z`).getTime()
}

export function statusColor(status: CheckStatus | null | undefined): string {
  switch (status) {
    case 'down':
      return chartColors.down
    case 'degraded':
      return chartColors.degraded
    case 'up':
      return chartColors.up
    default:
      return chartColors.neutral
  }
}

// Series colors for multi-site comparisons (up to 6). Call it inside a computed —
// returning a fresh array each time keeps it reactive to theme changes.
export function comparePalette(): string[] {
  return [
    chartColors.primary,
    chartColors.accent,
    chartColors.up,
    chartColors.maint,
    chartColors.degraded,
    chartColors.extra1,
  ]
}

const FONT = 'Barlow, sans-serif'

function makeTheme(p: ChartPalette) {
  const axis = {
    axisLine: { lineStyle: { color: p.axisLine } },
    axisTick: { lineStyle: { color: p.axisLine } },
    axisLabel: { color: p.text, fontSize: 10, fontFamily: FONT },
    splitLine: { lineStyle: { color: p.splitLine } },
  }
  return {
    backgroundColor: p.bg,
    textStyle: { color: p.text, fontFamily: FONT },
    title: {
      textStyle: { color: p.textStrong, fontFamily: FONT },
      subtextStyle: { color: p.text, fontFamily: FONT },
    },
    legend: { textStyle: { color: p.text, fontFamily: FONT } },
    tooltip: {
      backgroundColor: p.tooltipBg,
      borderColor: p.tooltipBorder,
      textStyle: { color: p.textStrong, fontSize: 12, fontFamily: FONT },
      // Flat by design — the S51 system uses borders, never shadows.
      extraCssText: 'border-radius: 8px;',
    },
    categoryAxis: axis,
    valueAxis: axis,
    timeAxis: axis,
    line: { itemStyle: { color: p.accent }, lineStyle: { color: p.accent } },
    color: [p.primary, p.accent, p.extra1, p.extra2, p.up, p.maint],
  }
}

echarts.registerTheme('uptime-light', makeTheme(LIGHT_PALETTE))
echarts.registerTheme('uptime-dark', makeTheme(DARK_PALETTE))

// Loosely-typed option object — full ComposeOption typing across this many chart/component
// types adds more friction than value here; call sites still get autocomplete via literals.
export type EChartsOption = Record<string, any>

export { echarts }
