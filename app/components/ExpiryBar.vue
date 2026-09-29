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

type Mode = 'ssl' | 'domain'
const mode = ref<Mode>('ssl')

const ranked = computed(() => {
  const days =
    mode.value === 'ssl'
      ? (s: SiteSummary) => s.latestCheck?.sslDaysRemaining ?? null
      : (s: SiteSummary) => s.domainDaysRemaining

  return props.sites
    .map((s) => ({ id: s.id, label: s.name || hostname(s), value: days(s) }))
    .filter((r): r is { id: number; label: string; value: number } => r.value !== null && r.value !== undefined)
    .sort((a, b) => a.value - b.value)
    .slice(0, 10)
    .reverse() // soonest-to-expire renders at the top
})

function colorFor(days: number): string {
  if (days < 7) return chartColors.down
  if (days < 30) return chartColors.degraded
  return chartColors.up
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
      itemStyle: { borderRadius: 999 },
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
  <UiCard>
    <UiSectionHeading class="mb-4">
      {{ mode === 'ssl' ? 'SSL expiry' : 'Domain expiry' }}
      <template #actions>
        <UiSegmentedControl
          v-model="mode"
          :options="[
            { label: 'SSL', value: 'ssl' },
            { label: 'Domain', value: 'domain' },
          ]"
        />
      </template>
    </UiSectionHeading>
    <div v-if="ranked.length" :style="{ height: `${Math.max(120, ranked.length * 28)}px` }">
      <BaseChart :option="option" class="cursor-pointer" @click="onClick" />
    </div>
    <div v-else class="flex h-24 items-center justify-center text-sm text-tertiary">
      {{ mode === 'ssl' ? 'No SSL data yet' : 'No domain expiry data yet' }}
    </div>
  </UiCard>
</template>
