<script setup lang="ts">
import type { CompareRow } from '#shared/types'

const route = useRoute()
const router = useRouter()
const { sites } = useSites()

useHead({ title: 'Compare sites' })

const STORAGE_KEY = 'siteUptime.compareIds'
const MAX_SITES = 6

function parseIdsParam(v: unknown): number[] {
  if (typeof v !== 'string' || !v) return []
  return [...new Set(v.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0))]
}

const selectedIds = ref<number[]>([])

onMounted(() => {
  const fromRoute = parseIdsParam(route.query.ids)
  if (fromRoute.length) {
    selectedIds.value = fromRoute
    return
  }
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return
  try {
    const parsed = JSON.parse(saved)
    if (Array.isArray(parsed)) selectedIds.value = parsed.filter((n) => typeof n === 'number')
  } catch {
    // ignore corrupt value
  }
})

watch(
  selectedIds,
  (ids) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
    router.replace({ query: { ...route.query, ids: ids.length ? ids.join(',') : undefined } })
  },
  { deep: true },
)

function toggleSite(id: number) {
  const idx = selectedIds.value.indexOf(id)
  if (idx === -1) {
    if (selectedIds.value.length >= MAX_SITES) return
    selectedIds.value = [...selectedIds.value, id]
  } else {
    selectedIds.value = selectedIds.value.filter((x) => x !== id)
  }
}

function hostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const hoursOptions = [
  { label: '24h', value: 24 },
  { label: '7d', value: 24 * 7 },
  { label: '30d', value: 24 * 30 },
]
const selectedHours = ref(24 * 7)

const compareData = ref<CompareRow[] | null>(null)
const loading = ref(false)
const fetchError = ref<string | null>(null)

export interface CompareTrafficEntry {
  siteId: number
  summary: { requests: number; errorRate: number; bytes: number; p95: number | null } | null
}
const trafficData = ref<CompareTrafficEntry[]>([])

async function loadComparison() {
  if (selectedIds.value.length < 2) {
    compareData.value = null
    trafficData.value = []
    fetchError.value = null
    return
  }
  loading.value = true
  fetchError.value = null
  const query = { ids: selectedIds.value.join(','), hours: selectedHours.value }
  try {
    // Fetched in parallel: uptime metrics come from SQLite, traffic from the DuckDB log store,
    // and sites without linked logs simply come back with a null summary.
    const [comparison, traffic] = await Promise.all([
      $fetch<CompareRow[]>('/api/compare', { query }),
      $fetch<{ traffic: CompareTrafficEntry[] }>('/api/compare-logs', { query }).catch(() => ({
        traffic: [],
      })),
    ])
    compareData.value = comparison
    trafficData.value = traffic.traffic
  } catch (e: any) {
    fetchError.value = e?.data?.statusMessage || 'Failed to load comparison'
  } finally {
    loading.value = false
  }
}

watch([selectedIds, selectedHours], loadComparison, { immediate: true, deep: true })
</script>

<template>
  <div class="flex flex-col gap-9">
    <div>
      <h1 class="font-display text-4xl font-bold tracking-tight text-primary">Compare sites</h1>
      <p class="mt-1.5 text-base text-secondary">
        Response time, uptime and reliability across the fleet.
      </p>
    </div>

    <UiCard>
      <UiSectionHeading as="h3" class="mb-4">
        Sites ({{ selectedIds.length }}/{{ MAX_SITES }})
        <template #actions>
          <UiSegmentedControl v-model="selectedHours" :options="hoursOptions" />
        </template>
      </UiSectionHeading>
      <div v-if="sites.length" class="flex flex-wrap gap-2">
        <UiChip
          v-for="site in sites"
          :key="site.id"
          size="sm"
          :active="selectedIds.includes(site.id)"
          :class="
            !selectedIds.includes(site.id) && selectedIds.length >= MAX_SITES
              ? 'pointer-events-none opacity-40'
              : ''
          "
          @click="toggleSite(site.id)"
        >
          {{ site.name || hostname(site.url) }}
        </UiChip>
      </div>
      <div v-else class="text-sm text-tertiary">No sites yet — add one from the dashboard first.</div>
    </UiCard>

    <UiEmptyState v-if="selectedIds.length < 2" icon="compare_arrows">
      Select 2 or more sites above to compare.
    </UiEmptyState>

    <div v-else-if="fetchError" class="rounded-lg border border-down bg-down-tint p-4 text-sm text-down">
      {{ fetchError }}
    </div>

    <div v-else-if="loading && !compareData" class="text-tertiary">Loading…</div>

    <template v-else-if="compareData">
      <CompareSummaryTable :rows="compareData" :traffic="trafficData" />

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CompareUptimeBar :rows="compareData" />
        <CompareLatencyBar :rows="compareData" />
      </div>

      <CompareResponseChart :rows="compareData" />

      <CompareLighthouseRadar :rows="compareData" />
    </template>
  </div>
</template>
