<script setup lang="ts">
import { formatDuration, formatExact } from '~/utils/logFormat'
import type { LogColumn } from '~/components/logs/DataTable.vue'

const route = useRoute()
const id = computed(() => Number(route.params.id))

const { data: digest, pending } = useLogView<{ digest: any[] }>('mysql/digest', () => ({
  digest: [],
}))

const columns: LogColumn[] = [
  { key: 'fingerprint', label: 'Normalized query', mono: true },
  { key: 'count', label: 'Calls', numeric: true, format: formatExact },
  { key: 'total_time', label: 'Total time', numeric: true, format: formatDuration },
  { key: 'avg_time', label: 'Avg', numeric: true, format: formatDuration },
  { key: 'max_time', label: 'Max', numeric: true, format: formatDuration },
  { key: 'avg_rows_examined', label: 'Rows read', numeric: true, format: (v) => formatExact(Math.round(Number(v))) },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <LogsDataTable
      title="Slow query digest"
      :columns="columns"
      :rows="digest?.digest ?? []"
      :pending="pending"
      row-key="fingerprint_hash"
      empty="No slow queries in this range"
      min-width="900px"
    >
      <template #actions>
        <span class="text-xs text-tertiary">Ranked by total time, not single slowest</span>
      </template>
      <template #detail="{ row }">
        <LogsMysqlSamples :site-id="id" :hash="String(row.fingerprint_hash)" />
      </template>
    </LogsDataTable>
  </div>
</template>
