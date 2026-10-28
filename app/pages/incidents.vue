<script setup lang="ts">
import type { IncidentListRow, IncidentTotals } from '#shared/types'

useHead({ title: 'Incidents — Site Uptime' })

const { sites } = useSites()

const STATUS_OPTIONS = [
  { label: 'All', value: 'all' as const },
  { label: 'Open', value: 'open' as const },
  { label: 'Resolved', value: 'resolved' as const },
]

const DURATION_OPTIONS = [
  { label: 'Any duration', value: 0 },
  { label: '1 minute or longer', value: 60 },
  { label: '5 minutes or longer', value: 300 },
  { label: '15 minutes or longer', value: 900 },
  { label: '1 hour or longer', value: 3600 },
  { label: '6 hours or longer', value: 21_600 },
  { label: '24 hours or longer', value: 86_400 },
]

const siteId = ref<number | ''>('')
const minDuration = ref(0)
const status = ref<'all' | 'open' | 'resolved'>('all')

const LIMIT = 50
const offset = ref(0)

watch([siteId, status, minDuration], () => {
  offset.value = 0
})

const filterQuery = computed(() => ({
  ...(siteId.value !== '' ? { siteId: siteId.value } : {}),
  ...(status.value !== 'all' ? { status: status.value } : {}),
  ...(minDuration.value ? { minDuration: minDuration.value } : {}),
}))

const listQuery = computed(() => ({ ...filterQuery.value, limit: LIMIT, offset: offset.value }))

const { data: page, refresh } = useFetch<IncidentListRow[]>('/api/incidents', {
  query: listQuery,
  default: () => [],
})
const { data: totals, refresh: refreshTotals } = useFetch<IncidentTotals>('/api/incidents/summary', {
  query: filterQuery,
  default: () => ({ count: 0, openCount: 0, mttrSeconds: null, totalDownSeconds: 0 }),
})

// Accumulates pages as "Load more" advances the offset; see the notifications page for why
// `immediate` matters and why the list resets only when the filters (not the offset) change.
const rows = ref<IncidentListRow[]>([])
watch(
  page,
  (value) => {
    rows.value = offset.value === 0 ? (value ?? []) : [...rows.value, ...(value ?? [])]
  },
  { immediate: true },
)
watch(listQuery, (next, prev) => {
  if (next.offset === prev.offset) rows.value = []
})

const hasMore = computed(() => rows.value.length < (totals.value?.count ?? 0))

function loadMore() {
  offset.value += LIMIT
}

async function reload() {
  offset.value = 0
  await Promise.all([refresh(), refreshTotals()])
}

// Polling only refreshes the first page; later pages stay as loaded.
usePoll(() => {
  if (offset.value === 0) reload()
  else refreshTotals()
})

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(2)}h`
}
</script>

<template>
  <div class="flex flex-col gap-9">
    <div>
      <h1 class="font-display text-4xl font-bold tracking-tight text-primary">Incidents</h1>
      <p class="mt-1.5 text-base text-secondary">Incident history across all monitored sites.</p>
    </div>

    <UiCard>
      <div class="flex flex-wrap items-end gap-4">
        <div class="w-52">
          <UiSelect
            v-model="siteId"
            label="Site"
            :options="[
              { label: 'All sites', value: '' },
              ...sites.map((s) => ({ label: s.name || s.url, value: s.id })),
            ]"
          />
        </div>
        <div class="w-56">
          <UiSelect v-model="minDuration" label="Duration" :options="DURATION_OPTIONS" />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-secondary">Status</span>
          <UiSegmentedControl v-model="status" :options="STATUS_OPTIONS" />
        </div>
        <div class="ml-auto">
          <UiButton variant="ghost" icon="refresh" @click="reload">Refresh</UiButton>
        </div>
      </div>
    </UiCard>

    <div class="grid grid-cols-2 gap-6 lg:grid-cols-4">
      <UiStatBlock label="Incidents" :value="totals?.count ?? 0" />
      <UiStatBlock
        label="Open now"
        :value="totals?.openCount ?? 0"
        :value-class="totals?.openCount ? 'text-down' : undefined"
      />
      <UiStatBlock label="MTTR" :value="formatDuration(totals?.mttrSeconds ?? null)" />
      <UiStatBlock label="Total downtime" :value="formatDuration(totals?.totalDownSeconds ?? 0)" />
    </div>

    <UiCard v-if="rows.some((i) => i.endedAt !== null)">
      <UiSectionHeading as="h3" class="mb-4">Incident duration (MTTR trend)</UiSectionHeading>
      <IncidentDurationBar :incidents="rows" />
    </UiCard>

    <IncidentList v-if="rows.length" :incidents="rows" :total="totals?.count" show-site />
    <UiEmptyState v-else icon="task_alt">No incidents recorded.</UiEmptyState>

    <div v-if="hasMore" class="flex justify-center">
      <UiButton variant="secondary" @click="loadMore">Load more</UiButton>
    </div>
  </div>
</template>
