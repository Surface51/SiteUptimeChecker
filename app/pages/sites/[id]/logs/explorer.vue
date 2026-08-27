<script setup lang="ts">
import { formatLogTime } from '~/utils/logFormat'
import type { LogColumn } from '~/components/logs/DataTable.vue'

const route = useRoute()
const id = computed(() => Number(route.params.id))
const filters = useInjectedLogFilters()

const TABLES = [
  { label: 'Access log', value: 'access_log' },
  { label: 'PHP errors', value: 'php_error' },
  { label: 'FPM events', value: 'fpm_events' },
  { label: 'PHP slow', value: 'php_slow' },
  { label: 'MySQL slow', value: 'mysql_slow' },
  { label: 'nginx errors', value: 'nginx_error_agg' },
  { label: 'DB events', value: 'db_events' },
]

const table = ref('access_log')
const clientIp = ref('')
const status = ref('')
const search = ref('')

const rows = ref<Record<string, any>[]>([])
const columns = ref<LogColumn[]>([])
const nextCursor = ref<string | null>(null)
const pending = ref(false)

const supportsIp = computed(() => table.value === 'access_log')
const supportsStatus = computed(() => table.value === 'access_log')
const supportsSearch = computed(() =>
  ['access_log', 'fpm_events', 'php_slow', 'nginx_error_agg'].includes(table.value),
)

function queryParams(cursor?: string) {
  return {
    ...filters.query.value,
    ...(clientIp.value ? { client_ip: clientIp.value } : {}),
    ...(status.value ? { status: status.value } : {}),
    ...(search.value ? { search: search.value } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 50,
  }
}

async function load(append = false) {
  pending.value = true
  try {
    const result = await $fetch<{ columns: string[]; rows: Record<string, any>[]; nextCursor: string | null }>(
      `/api/sites/${id.value}/logs/explorer/${table.value}`,
      { query: queryParams(append ? (nextCursor.value ?? undefined) : undefined) },
    )
    columns.value = result.columns.map((key) => ({
      key,
      label: key.replace(/_/g, ' '),
      mono: key !== 'ts' && key !== 'bucket',
      numeric: ['status', 'bytes', 'duration', 'count', 'pid', 'rows_examined', 'query_time'].includes(key),
      format: key === 'ts' || key === 'bucket' ? (v: any) => formatLogTime(v) : undefined,
    }))
    rows.value = append ? [...rows.value, ...result.rows] : result.rows
    nextCursor.value = result.nextCursor
  } finally {
    pending.value = false
  }
}

// Changing the table resets the filters that don't apply to it, then reloads.
watch(table, () => {
  clientIp.value = ''
  status.value = ''
  search.value = ''
  nextCursor.value = null
  load()
})

watch(filters.query, () => load())

onMounted(() => load())

const csvHref = computed(() => {
  const params = new URLSearchParams({ ...(queryParams() as any), format: 'csv' })
  return `/api/sites/${id.value}/logs/explorer/${table.value}?${params}`
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <UiCard>
      <div class="flex flex-col gap-4">
        <UiSectionHeading as="h3">Raw rows</UiSectionHeading>

        <div class="flex flex-wrap items-end gap-3">
          <div class="w-48">
            <UiSelect v-model="table" label="Table" :options="TABLES" />
          </div>
          <div v-if="supportsIp" class="w-44">
            <UiInput v-model="clientIp" label="Client IP" placeholder="1.2.3.4" @keyup.enter="load()" />
          </div>
          <div v-if="supportsStatus" class="w-28">
            <UiInput v-model="status" label="Status" placeholder="404" @keyup.enter="load()" />
          </div>
          <div v-if="supportsSearch" class="min-w-[200px] flex-1">
            <UiInput v-model="search" label="Contains" placeholder="/wp-admin" @keyup.enter="load()" />
          </div>
          <UiButton variant="secondary" :disabled="pending" @click="load()">
            {{ pending ? 'Loading…' : 'Apply' }}
          </UiButton>
        </div>
      </div>
    </UiCard>

    <LogsDataTable
      :title="TABLES.find((t) => t.value === table)?.label ?? table"
      :columns="columns"
      :rows="rows"
      :pending="pending"
      :csv-href="csvHref"
      empty="No rows match these filters"
      min-width="900px"
    >
      <template #footer>
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs text-tertiary">{{ rows.length }} row(s) loaded</span>
          <UiButton v-if="nextCursor" variant="ghost" size="sm" :disabled="pending" @click="load(true)">
            Load more
          </UiButton>
        </div>
      </template>
    </LogsDataTable>
  </div>
</template>
