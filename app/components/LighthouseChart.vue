<script setup lang="ts">
import type { LighthouseReport } from '#shared/types'

export type LighthouseMetric = 'performance' | 'accessibility' | 'bestPractices' | 'seo' | 'fcp' | 'lcp' | 'tbt' | 'cls' | 'speedIndex' | 'tti'

const props = defineProps<{ points: LighthouseReport[] }>()

const selectedMetric = ref<LighthouseMetric>('performance')

const METRIC_CONFIG: Record<LighthouseMetric, { label: string; isScore: boolean; format: (v: number) => string }> = {
  performance: { label: 'Performance', isScore: true, format: (v) => `${Math.round(v)}` },
  accessibility: { label: 'Accessibility', isScore: true, format: (v) => `${Math.round(v)}` },
  bestPractices: { label: 'Best Practices', isScore: true, format: (v) => `${Math.round(v)}` },
  seo: { label: 'SEO', isScore: true, format: (v) => `${Math.round(v)}` },
  fcp: { label: 'FCP', isScore: false, format: (v) => `${(v / 1000).toFixed(2)}s` },
  lcp: { label: 'LCP', isScore: false, format: (v) => `${(v / 1000).toFixed(2)}s` },
  tbt: { label: 'TBT', isScore: false, format: (v) => `${Math.round(v)}ms` },
  cls: { label: 'CLS', isScore: false, format: (v) => v.toFixed(3) },
  speedIndex: { label: 'Speed Index', isScore: false, format: (v) => `${(v / 1000).toFixed(2)}s` },
  tti: { label: 'TTI', isScore: false, format: (v) => `${(v / 1000).toFixed(2)}s` },
}

const width = 800
const height = 220
const padding = { top: 16, right: 16, bottom: 8, left: 44 }
const plotWidth = width - padding.left - padding.right
const plotHeight = height - padding.top - padding.bottom

const METRIC_ORDER: LighthouseMetric[] = [
  'performance',
  'accessibility',
  'bestPractices',
  'seo',
  'fcp',
  'lcp',
  'tbt',
  'cls',
  'speedIndex',
  'tti',
]

const config = computed(() => METRIC_CONFIG[selectedMetric.value])

const values = computed(() => props.points.map((p) => p[selectedMetric.value]))

const maxY = computed(() => {
  if (config.value.isScore) return 100
  const nums = values.value.filter((v): v is number => v !== null)
  const max = nums.length ? Math.max(...nums) : 0
  if (max <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(max))
  return Math.ceil((max * 1.1) / pow) * pow
})

function xFor(i: number) {
  if (props.points.length <= 1) return padding.left
  return padding.left + (i / (props.points.length - 1)) * plotWidth
}
function yFor(v: number) {
  return padding.top + plotHeight - (v / maxY.value) * plotHeight
}

const linePath = computed(() => {
  let d = ''
  let started = false
  values.value.forEach((v, i) => {
    if (v === null) {
      started = false
      return
    }
    const x = xFor(i)
    const y = yFor(v)
    d += started ? ` L${x.toFixed(1)},${y.toFixed(1)}` : `${d ? ' ' : ''}M${x.toFixed(1)},${y.toFixed(1)}`
    started = true
  })
  return d.trim()
})

const yTicks = computed(() => {
  const steps = 4
  return Array.from({ length: steps + 1 }, (_, i) => (maxY.value / steps) * i)
})

const hoverIndex = ref<number | null>(null)

function onMove(e: MouseEvent) {
  const svg = e.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  if (props.points.length < 1) {
    hoverIndex.value = null
    return
  }
  const relX = ((e.clientX - rect.left) / rect.width) * width
  const ratio = Math.min(Math.max((relX - padding.left) / plotWidth, 0), 1)
  hoverIndex.value = props.points.length > 1 ? Math.round(ratio * (props.points.length - 1)) : 0
}

const hoverPoint = computed(() => (hoverIndex.value !== null ? props.points[hoverIndex.value] : null))
const hoverValue = computed(() => (hoverIndex.value !== null ? values.value[hoverIndex.value] : null))

function formatTime(iso: string) {
  return new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString()
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-1 text-xs">
      <button
        v-for="m in METRIC_ORDER"
        :key="m"
        type="button"
        class="rounded px-2 py-1"
        :class="selectedMetric === m ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
        @click="selectedMetric = m"
      >
        {{ METRIC_CONFIG[m].label }}
      </button>
    </div>
    <div class="relative">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      class="h-auto w-full touch-none"
      @mousemove="onMove"
      @mouseleave="hoverIndex = null"
    >
      <line
        v-for="(t, i) in yTicks"
        :key="'grid-' + i"
        :x1="padding.left"
        :x2="width - padding.right"
        :y1="yFor(t)"
        :y2="yFor(t)"
        stroke="currentColor"
        stroke-width="1"
        class="text-slate-800"
      />
      <text
        v-for="(t, i) in yTicks"
        :key="'label-' + i"
        :x="padding.left - 8"
        :y="yFor(t) + 3"
        text-anchor="end"
        class="fill-slate-500 text-[10px]"
      >{{ config.isScore ? Math.round(t) : config.format(t) }}</text>

      <path
        v-if="linePath"
        :d="linePath"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-sky-400"
      />

      <template v-if="hoverIndex !== null && points.length">
        <line
          :x1="xFor(hoverIndex)"
          :x2="xFor(hoverIndex)"
          :y1="padding.top"
          :y2="padding.top + plotHeight"
          stroke="currentColor"
          stroke-width="1"
          class="text-slate-600"
        />
        <circle
          v-if="hoverValue != null"
          :cx="xFor(hoverIndex)"
          :cy="yFor(hoverValue)"
          r="4"
          class="fill-sky-400"
          stroke="#0f172a"
          stroke-width="2"
        />
      </template>
    </svg>

    <div
      v-if="hoverPoint"
      class="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-[110%] whitespace-nowrap rounded-md border border-slate-700 bg-slate-900/95 px-2 py-1 text-xs shadow-lg"
      :style="{ left: `${(xFor(hoverIndex!) / width) * 100}%` }"
    >
      <div class="font-medium text-slate-100">
        {{ hoverValue != null ? config.format(hoverValue) : 'No data' }}
        <span v-if="hoverPoint.error" class="ml-1 text-rose-400">(failed)</span>
      </div>
      <div class="text-slate-400">{{ formatTime(hoverPoint.measuredAt) }}</div>
    </div>

    <div v-if="!points.length" class="absolute inset-0 flex items-center justify-center text-sm text-slate-600">
      No history in this range
    </div>
    </div>
  </div>
</template>
