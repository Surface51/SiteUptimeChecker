<script setup lang="ts">
import { chartColors } from '~/utils/echarts'
import { formatCount, formatDuration, formatExact, formatLogTime } from '~/utils/logFormat'
import type { LogColumn } from '~/components/logs/DataTable.vue'

interface FpmOverview {
  overview: {
    child_exits: number
    child_starts: number
    slow_exec_count: number
    max_children_count: number
    avg_child_lifetime: number | null
    avg_slow_sec: number | null
  }
  topSlowRequests: any[]
}

const { data: fpm, pending } = useLogView<FpmOverview>('fpm/overview', () => ({
  overview: {
    child_exits: 0,
    child_starts: 0,
    slow_exec_count: 0,
    max_children_count: 0,
    avg_child_lifetime: null,
    avg_slow_sec: null,
  },
  topSlowRequests: [],
}))

const { data: timeseries } = useLogView<{ series: any[] }>('fpm/timeseries', () => ({ series: [] }))

const { data: slowGroups, pending: slowPending } = useLogView<{ groups: any[] }>(
  'phpslow/groups',
  () => ({ groups: [] }),
)

// Three pool signals. Recycling is routine, so it stays neutral ink; the two that indicate
// trouble take the blue/red pair.
const fpmSeries = computed(() => [
  { name: 'child_exited', label: 'Worker recycled', color: chartColors.neutral },
  { name: 'slow_exec', label: 'Slow request', color: chartColors.logAlt },
  { name: 'max_children', label: 'Pool exhausted', color: chartColors.down },
])

const slowColumns: LogColumn[] = [
  { key: 'ts', label: 'When', format: formatLogTime },
  { key: 'pool', label: 'Pool' },
  { key: 'request_url', label: 'Request', mono: true },
  { key: 'slow_sec', label: 'Duration', numeric: true, format: formatDuration },
]

const groupColumns: LogColumn[] = [
  { key: 'script', label: 'Script', mono: true },
  { key: 'occurrences', label: 'Count', numeric: true, format: formatExact },
  { key: 'last_seen', label: 'Last seen', format: formatLogTime },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <UiCard>
      <div class="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <UiStatBlock
          :value="formatExact(fpm?.overview.max_children_count)"
          label="Pool exhausted"
          :value-class="Number(fpm?.overview.max_children_count) > 0 ? 'text-down' : 'text-primary'"
        />
        <UiStatBlock :value="formatExact(fpm?.overview.slow_exec_count)" label="Slow executions" />
        <UiStatBlock :value="formatCount(fpm?.overview.child_exits)" label="Workers recycled" />
        <UiStatBlock
          :value="formatDuration(fpm?.overview.avg_child_lifetime)"
          label="Avg worker lifetime"
        />
      </div>
      <p v-if="pending" class="mt-4 text-xs text-tertiary">Loading…</p>
      <p
        v-else-if="Number(fpm?.overview.max_children_count) > 0"
        class="mt-4 rounded-md bg-down-tint p-3 text-sm text-down"
      >
        The pool hit its worker limit {{ formatExact(fpm?.overview.max_children_count) }} time(s).
        Requests queue behind this, so it usually shows up as slow responses to visitors.
      </p>
    </UiCard>

    <UiCard>
      <div class="flex flex-col gap-4">
        <UiSectionHeading as="h3">Pool events over time</UiSectionHeading>
        <LogsTimeseriesChart
          :rows="timeseries?.series ?? []"
          :series="fpmSeries"
          type="line"
          :value-formatter="formatCount"
          empty="No PHP-FPM events in this range"
        />
      </div>
    </UiCard>

    <LogsDataTable
      title="Slowest requests"
      :columns="slowColumns"
      :rows="fpm?.topSlowRequests ?? []"
      :pending="pending"
      empty="No slow executions logged in this range"
      min-width="680px"
    />

    <LogsDataTable
      title="Slow-log stacks"
      :columns="groupColumns"
      :rows="slowGroups?.groups ?? []"
      :pending="slowPending"
      row-key="fingerprint"
      empty="No slow-log entries in this range"
      min-width="560px"
    >
      <template #detail="{ row }">
        <pre
          class="max-h-72 overflow-auto rounded-md bg-page p-3 font-mono text-xs whitespace-pre-wrap text-secondary"
        >{{ row.sample_stack }}</pre>
      </template>
    </LogsDataTable>
  </div>
</template>
