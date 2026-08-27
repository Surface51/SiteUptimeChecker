<script setup lang="ts">
import { chartColors } from '~/utils/echarts'
import { formatCount, formatExact, formatLogTime, statusTone } from '~/utils/logFormat'
import type { LogColumn } from '~/components/logs/DataTable.vue'

const route = useRoute()
const id = computed(() => Number(route.params.id))

const { data: timeseries } = useLogView<{ series: any[] }>('errors/http-timeseries', () => ({
  series: [],
}))

const { data: topErrors, pending: topPending } = useLogView<{ top: any[] }>(
  'errors/http-top',
  () => ({ top: [] }),
)

const { data: nginxGroups, pending: nginxPending } = useLogView<{ groups: any[] }>(
  'errors/nginx',
  () => ({ groups: [] }),
)

const { data: phpGroups, pending: phpPending } = useLogView<{ groups: any[] }>('errors/php', () => ({
  groups: [],
}))

// Blue/red rather than amber/red — see logSeriesPalette() for the contrast measurements.
const errorSeries = computed(() => [
  { name: '4xx', label: '4xx client', color: chartColors.logAlt },
  { name: '5xx', label: '5xx server', color: chartColors.down },
])

const topColumns: LogColumn[] = [
  { key: 'path_pattern', label: 'Endpoint', mono: true },
  { key: 'status', label: 'Status' },
  { key: 'count', label: 'Count', numeric: true, format: formatExact },
]

const nginxColumns: LogColumn[] = [
  { key: 'level', label: 'Level' },
  { key: 'sample_message', label: 'Message', mono: true },
  { key: 'total_count', label: 'Count', numeric: true, format: formatExact },
  { key: 'last_seen', label: 'Last seen', format: formatLogTime },
]

const phpColumns: LogColumn[] = [
  { key: 'error_type', label: 'Type' },
  { key: 'sample_message', label: 'Message', mono: true },
  { key: 'occurrences', label: 'Count', numeric: true, format: formatExact },
  { key: 'last_seen', label: 'Last seen', format: formatLogTime },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <UiCard>
      <div class="flex flex-col gap-4">
        <UiSectionHeading as="h3">HTTP errors over time</UiSectionHeading>
        <LogsTimeseriesChart
          :rows="timeseries?.series ?? []"
          :series="errorSeries"
          type="bar"
          stack
          :value-formatter="formatCount"
          empty="No 4xx or 5xx responses in this range"
        />
      </div>
    </UiCard>

    <LogsDataTable
      title="Failing endpoints"
      :columns="topColumns"
      :rows="topErrors?.top ?? []"
      :pending="topPending"
      empty="No failing endpoints in this range"
    >
      <template #cell-status="{ value }">
        <UiBadge :tone="statusTone(Number(value))">{{ value }}</UiBadge>
      </template>
    </LogsDataTable>

    <LogsDataTable
      title="PHP errors"
      :columns="phpColumns"
      :rows="phpGroups?.groups ?? []"
      :pending="phpPending"
      row-key="fingerprint"
      empty="No PHP errors in this range"
      min-width="760px"
    >
      <template #detail="{ row }">
        <LogsPhpErrorDetail :site-id="id" :fingerprint="String(row.fingerprint)" />
      </template>
    </LogsDataTable>

    <LogsDataTable
      title="nginx errors"
      :columns="nginxColumns"
      :rows="nginxGroups?.groups ?? []"
      :pending="nginxPending"
      row-key="fingerprint"
      empty="No nginx errors in this range"
      min-width="760px"
    >
      <template #cell-level="{ value }">
        <UiBadge :tone="String(value) === 'error' || String(value) === 'crit' ? 'down' : 'degraded'">
          {{ value }}
        </UiBadge>
      </template>
      <template #detail="{ row }">
        <div class="flex flex-col gap-2 font-mono text-xs break-all text-secondary">
          <p>{{ row.sample_message }}</p>
          <p v-if="row.sample_request"><span class="text-tertiary">request:</span> {{ row.sample_request }}</p>
          <p v-if="row.sample_host"><span class="text-tertiary">host:</span> {{ row.sample_host }}</p>
          <p><span class="text-tertiary">first seen:</span> {{ formatLogTime(row.first_seen) }}</p>
        </div>
      </template>
    </LogsDataTable>
  </div>
</template>
