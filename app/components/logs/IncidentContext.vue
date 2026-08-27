<script setup lang="ts">
import { chartColors, type EChartsOption } from '~/utils/echarts'
import { formatCount, formatExact, logTimeMs } from '~/utils/logFormat'

const props = defineProps<{ siteId: number; incidentId: number }>()

interface ContextResponse {
  context: {
    requests: { bucket: string; series: string; value: number }[]
    topPaths: any[]
    phpErrors: any[]
    fpmEvents: any[]
    topIps: any[]
  } | null
}

const { data, pending, error } = await useFetch<ContextResponse>(
  () => `/api/sites/${props.siteId}/logs/incident-context`,
  {
    query: computed(() => ({ incidentId: props.incidentId })),
    server: false,
    default: () => ({ context: null }),
  },
)

const context = computed(() => data.value?.context ?? null)

const hasAnything = computed(() => {
  const c = context.value
  return !!c && (c.requests.length || c.phpErrors.length || c.fpmEvents.length)
})

const option = computed<EChartsOption>(() => {
  const rows = context.value?.requests ?? []
  const split = (name: string) =>
    rows
      .filter((row) => row.series === name)
      .map((row) => [logTimeMs(row.bucket), Number(row.value)] as [number, number])
      .sort((a, b) => a[0] - b[0])

  return {
    grid: { left: 48, right: 12, top: 28, bottom: 24 },
    legend: { top: 0, textStyle: { fontSize: 10 }, itemHeight: 8, itemWidth: 12 },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatCount(v) } },
    tooltip: { trigger: 'axis' },
    series: [
      {
        name: 'Other responses',
        type: 'bar',
        stack: 'req',
        data: split('other'),
        itemStyle: { color: chartColors.neutral, borderColor: chartColors.surface, borderWidth: 1 },
      },
      {
        name: '5xx',
        type: 'bar',
        stack: 'req',
        data: split('5xx'),
        itemStyle: { color: chartColors.down, borderColor: chartColors.surface, borderWidth: 1 },
      },
    ],
  }
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="pending" class="text-xs text-tertiary">Loading log context…</p>
    <p v-else-if="error" class="text-xs text-tertiary">Couldn't load log context for this window.</p>

    <template v-else-if="hasAnything">
      <p class="text-xs text-tertiary">
        Requests per minute around the incident, padded by 15 minutes either side.
      </p>
      <div class="h-40">
        <BaseChart :option="option" />
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div v-if="context!.topPaths.length" class="flex flex-col gap-1">
          <span class="text-xs font-semibold tracking-wide text-tertiary uppercase">Failing endpoints</span>
          <p
            v-for="(row, index) in context!.topPaths.slice(0, 5)"
            :key="index"
            class="flex justify-between gap-3 font-mono text-xs text-secondary"
          >
            <span class="truncate">{{ row.path_pattern }}</span>
            <span class="shrink-0 tabular-nums">{{ row.status }} · {{ formatExact(row.count) }}</span>
          </p>
        </div>

        <div v-if="context!.phpErrors.length" class="flex flex-col gap-1">
          <span class="text-xs font-semibold tracking-wide text-tertiary uppercase">PHP errors</span>
          <p
            v-for="(row, index) in context!.phpErrors.slice(0, 5)"
            :key="index"
            class="truncate font-mono text-xs text-secondary"
            :title="row.sample_message"
          >
            {{ formatExact(row.occurrences) }}× {{ row.sample_message }}
          </p>
        </div>

        <div v-if="context!.fpmEvents.length" class="flex flex-col gap-1">
          <span class="text-xs font-semibold tracking-wide text-tertiary uppercase">PHP-FPM</span>
          <p
            v-for="(row, index) in context!.fpmEvents"
            :key="index"
            class="flex justify-between gap-3 font-mono text-xs text-secondary"
          >
            <span>{{ row.event_type }}</span>
            <span class="tabular-nums">{{ formatExact(row.count) }}</span>
          </p>
        </div>

        <div v-if="context!.topIps.length" class="flex flex-col gap-1">
          <span class="text-xs font-semibold tracking-wide text-tertiary uppercase">Busiest clients</span>
          <p
            v-for="(row, index) in context!.topIps"
            :key="index"
            class="flex justify-between gap-3 font-mono text-xs text-secondary"
          >
            <span>{{ row.client_ip }}</span>
            <span class="tabular-nums">{{ formatExact(row.requests) }}</span>
          </p>
        </div>
      </div>
    </template>

    <p v-else class="text-xs text-tertiary">
      No log rows cover this window — the logs may not reach back this far.
    </p>
  </div>
</template>
