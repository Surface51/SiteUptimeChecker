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
    { name: 'Up', value: up, color: chartColors.up },
    { name: 'Degraded', value: degraded, color: chartColors.degraded },
    { name: 'Down', value: down, color: chartColors.down },
    { name: 'Paused', value: paused, color: chartColors.neutral },
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
      itemStyle: { borderColor: chartColors.tooltipBg, borderWidth: 2 },
      data: counts.value.map((c) => ({ name: c.name, value: c.value, itemStyle: { color: c.color } })),
    },
  ],
}))
</script>

<template>
  <UiCard padding="p-5">
    <div class="mb-2 text-xs tracking-wide text-tertiary uppercase">Fleet status</div>
    <div v-if="sites.length" class="flex items-center gap-4">
      <div class="h-24 w-24 shrink-0">
        <BaseChart :option="option" />
      </div>
      <ul class="flex flex-col gap-1.5 text-sm">
        <li v-for="c in counts" :key="c.name" class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: c.color }" />
          <span class="text-secondary">{{ c.name }}</span>
          <span class="font-medium text-primary">{{ c.value }}</span>
        </li>
      </ul>
    </div>
    <div v-else class="flex h-24 items-center justify-center text-sm text-tertiary">No sites</div>
  </UiCard>
</template>
