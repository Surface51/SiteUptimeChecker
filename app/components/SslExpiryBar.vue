<script setup lang="ts">
import type { SiteSummary } from '#shared/types'
import { chartColors, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ sites: SiteSummary[] }>()
const router = useRouter()

function hostname(site: SiteSummary) {
  try {
    return new URL(site.url).hostname
  } catch {
    return site.url
  }
}

const ranked = computed(() => {
  return props.sites
    .filter((s) => s.latestCheck?.sslDaysRemaining !== null && s.latestCheck?.sslDaysRemaining !== undefined)
    .map((s) => ({ id: s.id, label: s.name || hostname(s), value: s.latestCheck!.sslDaysRemaining as number }))
    .sort((a, b) => a.value - b.value)
    .slice(0, 10)
    .reverse() // soonest-to-expire renders at the top
})

function colorFor(days: number): string {
  if (days < 7) return chartColors.rose
  if (days < 30) return chartColors.amber
  return chartColors.emerald
}

const option = computed<EChartsOption>(() => ({
  grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
  tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}: ${p.value}d remaining` },
  xAxis: { type: 'value', min: 0, show: false },
  yAxis: {
    type: 'category',
    data: ranked.value.map((r) => r.label),
    axisLine: { show: false },
    axisTick: { show: false },
  },
  series: [
    {
      type: 'bar',
      barMaxWidth: 14,
      data: ranked.value.map((r) => ({ value: r.value, siteId: r.id, itemStyle: { color: colorFor(r.value) } })),
      label: { show: true, position: 'right', formatter: '{c}d', color: chartColors.textStrong, fontSize: 11 },
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
    <h2 class="mb-3 text-sm font-medium text-slate-200">SSL expiry</h2>
    <div v-if="ranked.length" :style="{ height: `${Math.max(120, ranked.length * 28)}px` }">
      <BaseChart :option="option" class="cursor-pointer" @click="onClick" />
    </div>
    <div v-else class="flex h-24 items-center justify-center text-sm text-slate-600">No SSL data yet</div>
  </div>
</template>
