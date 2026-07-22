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

// Palette matching the app's Tailwind slate/sky/rose/amber/emerald usage.
export const chartColors = {
  bg: 'transparent',
  axisLine: '#1e293b', // slate-800
  splitLine: '#1e293b', // slate-800
  text: '#64748b', // slate-500
  textStrong: '#e2e8f0', // slate-200
  sky: '#38bdf8', // sky-400
  emerald: '#34d399', // emerald-400
  amber: '#fbbf24', // amber-400
  rose: '#fb7185', // rose-400
  slate: '#475569', // slate-600
  tooltipBg: 'rgba(15, 23, 42, 0.95)', // slate-900/95
  tooltipBorder: '#334155', // slate-700
}

// The DB stores "YYYY-MM-DD HH:MM:SS" (UTC, no offset) — normalize to a real timestamp.
export function parseDbTime(iso: string): number {
  return new Date(`${iso.replace(' ', 'T')}Z`).getTime()
}

export function statusColor(status: CheckStatus | null | undefined): string {
  switch (status) {
    case 'down':
      return chartColors.rose
    case 'degraded':
      return chartColors.amber
    case 'up':
      return chartColors.emerald
    default:
      return chartColors.slate
  }
}

echarts.registerTheme('uptime-dark', {
  backgroundColor: chartColors.bg,
  textStyle: { color: chartColors.text },
  title: { textStyle: { color: chartColors.textStrong }, subtextStyle: { color: chartColors.text } },
  legend: { textStyle: { color: chartColors.text } },
  tooltip: {
    backgroundColor: chartColors.tooltipBg,
    borderColor: chartColors.tooltipBorder,
    textStyle: { color: chartColors.textStrong, fontSize: 12 },
    extraCssText: 'border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.4);',
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: chartColors.axisLine } },
    axisTick: { lineStyle: { color: chartColors.axisLine } },
    axisLabel: { color: chartColors.text, fontSize: 10 },
    splitLine: { lineStyle: { color: chartColors.splitLine } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: chartColors.axisLine } },
    axisTick: { lineStyle: { color: chartColors.axisLine } },
    axisLabel: { color: chartColors.text, fontSize: 10 },
    splitLine: { lineStyle: { color: chartColors.splitLine } },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: chartColors.axisLine } },
    axisTick: { lineStyle: { color: chartColors.axisLine } },
    axisLabel: { color: chartColors.text, fontSize: 10 },
    splitLine: { lineStyle: { color: chartColors.splitLine } },
  },
  line: { itemStyle: { color: chartColors.sky }, lineStyle: { color: chartColors.sky } },
  color: [chartColors.sky, chartColors.emerald, chartColors.amber, chartColors.rose, chartColors.slate],
})

// Loosely-typed option object — full ComposeOption typing across this many chart/component
// types adds more friction than value here; call sites still get autocomplete via literals.
export type EChartsOption = Record<string, any>

export { echarts }
