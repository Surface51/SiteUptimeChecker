<script setup lang="ts">
import type { SiteSummary } from '#shared/types'
import { chartColors, type EChartsOption } from '../utils/echarts'

const props = defineProps<{ sites: SiteSummary[] }>()

const counts = computed(() => {
  const up = props.sites.filter((s) => s.enabled && s.latestCheck?.status === 'up').length
  const degraded = props.sites.filter((s) => s.enabled && s.latestCheck?.status === 'degraded').length
  const down = props.sites.filter((s) => s.enabled && s.latestCheck?.status === 'down').length
  const paused = props.sites.filter((s) => !s.enabled).length
  return [
    { name: 'Up', value: up, color: chartColors.emerald },
    { name: 'Degraded', value: degraded, color: chartColors.amber },
    { name: 'Down', value: down, color: chartColors.rose },
    { name: 'Paused', value: paused, color: chartColors.slate },
  ].filter((d) => d.value > 0)
})

const option = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  legend: { show: false },
  series: [
    {
      type: 'pie',
      radius: ['55%', '80%'],
      avoidLabelOverlap: false,
      label: { show: false },
      labelLine: { show: false },
      itemStyle: { borderColor: '#0f172a', borderWidth: 2 },
      data: counts.value.map((c) => ({ name: c.name, value: c.value, itemStyle: { color: c.color } })),
    },
  ],
}))
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
    <div class="text-xs text-slate-500">Fleet status</div>
    <div v-if="sites.length" class="flex items-center gap-3">
      <div class="h-24 w-24 shrink-0">
        <BaseChart :option="option" />
      </div>
      <ul class="flex flex-col gap-1 text-xs">
        <li v-for="c in counts" :key="c.name" class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: c.color }" />
          <span class="text-slate-400">{{ c.name }}</span>
          <span class="font-medium text-slate-200">{{ c.value }}</span>
        </li>
      </ul>
    </div>
    <div v-else class="flex h-24 items-center justify-center text-sm text-slate-600">No sites</div>
  </div>
</template>
