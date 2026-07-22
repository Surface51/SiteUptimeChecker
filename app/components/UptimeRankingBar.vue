<script setup lang="ts">
import type { SiteSummary } from '#shared/types'
import { chartColors, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ sites: SiteSummary[] }>()
const router = useRouter()

const window_ = ref<'uptime24h' | 'uptime7d'>('uptime24h')

const pageSize = 10
const page = ref(1)
watch(window_, () => {
  page.value = 1
})

function hostname(site: SiteSummary) {
  try {
    return new URL(site.url).hostname
  } catch {
    return site.url
  }
}

const ranked = computed(() => {
  return props.sites
    .filter((s) => s[window_.value] !== null)
    .map((s) => ({ id: s.id, label: s.name || hostname(s), value: Math.round((s[window_.value] as number) * 100) / 100 }))
    .sort((a, b) => b.value - a.value) // worst last so it renders at the top of an inverted category axis
})

const totalPages = computed(() => Math.max(1, Math.ceil(ranked.value.length / pageSize)))

watch(totalPages, (max) => {
  if (page.value > max) page.value = max
})

const pagedRanked = computed(() => {
  const start = (page.value - 1) * pageSize
  return ranked.value.slice(start, start + pageSize)
})

function colorFor(value: number): string {
  if (value >= 99.9) return chartColors.emerald
  if (value >= 99) return chartColors.sky
  if (value >= 95) return chartColors.amber
  return chartColors.rose
}

const option = computed<EChartsOption>(() => ({
  grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
  tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}: ${p.value.toFixed(2)}%` },
  xAxis: { type: 'value', min: 0, max: 100, show: false },
  yAxis: {
    type: 'category',
    inverse: true,
    data: pagedRanked.value.map((r) => r.label),
    axisLine: { show: false },
    axisTick: { show: false },
  },
  series: [
    {
      type: 'bar',
      barMaxWidth: 14,
      data: pagedRanked.value.map((r) => ({ value: r.value, siteId: r.id, itemStyle: { color: colorFor(r.value) } })),
      label: {
        show: true,
        position: 'right',
        formatter: (p: any) => `${p.value.toFixed(2)}%`,
        color: chartColors.textStrong,
        fontSize: 11,
      },
    },
  ],
}))

function onClick(params: any) {
  const siteId = params?.data?.siteId
  if (siteId) router.push(`/sites/${siteId}`)
}
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-medium text-slate-200">Uptime ranking</h2>
      <div class="flex gap-1 rounded-md border border-slate-800 p-0.5 text-xs">
        <button
          type="button"
          class="rounded px-2 py-1"
          :class="window_ === 'uptime24h' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
          @click="window_ = 'uptime24h'"
        >
          24h
        </button>
        <button
          type="button"
          class="rounded px-2 py-1"
          :class="window_ === 'uptime7d' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
          @click="window_ = 'uptime7d'"
        >
          7d
        </button>
      </div>
    </div>
    <div v-if="pagedRanked.length" :style="{ height: `${Math.max(120, pagedRanked.length * 28)}px` }">
      <BaseChart :option="option" class="cursor-pointer" @click="onClick" />
    </div>
    <div v-else class="flex h-24 items-center justify-center text-sm text-slate-600">No uptime data yet</div>

    <div v-if="ranked.length > pageSize" class="mt-2 flex items-center justify-between text-xs text-slate-500">
      <span>
        {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, ranked.length) }} of {{ ranked.length }}
      </span>
      <div class="flex gap-1">
        <button
          type="button"
          :disabled="page <= 1"
          class="rounded-md border border-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
          @click="page -= 1"
        >
          Prev
        </button>
        <button
          type="button"
          :disabled="page >= totalPages"
          class="rounded-md border border-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
          @click="page += 1"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>
