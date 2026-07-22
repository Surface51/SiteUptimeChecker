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

async function loadComparison() {
  if (selectedIds.value.length < 2) {
    compareData.value = null
    fetchError.value = null
    return
  }
  loading.value = true
  fetchError.value = null
  try {
    compareData.value = await $fetch<CompareRow[]>('/api/compare', {
      query: { ids: selectedIds.value.join(','), hours: selectedHours.value },
    })
  } catch (e: any) {
    fetchError.value = e?.data?.statusMessage || 'Failed to load comparison'
  } finally {
    loading.value = false
  }
}

watch([selectedIds, selectedHours], loadComparison, { immediate: true, deep: true })
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <NuxtLink to="/" class="text-sm text-slate-500 hover:text-slate-300">← Back to dashboard</NuxtLink>
      <h1 class="mt-2 text-lg font-semibold text-slate-100">Compare sites</h1>
    </div>

    <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-medium text-slate-200">Sites ({{ selectedIds.length }}/{{ MAX_SITES }})</h2>
        <div class="flex gap-1 rounded-md border border-slate-800 p-0.5 text-xs">
          <button
            v-for="opt in hoursOptions"
            :key="opt.value"
            type="button"
            class="rounded px-2.5 py-1"
            :class="selectedHours === opt.value ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
            @click="selectedHours = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div v-if="sites.length" class="flex flex-wrap gap-2">
        <button
          v-for="site in sites"
          :key="site.id"
          type="button"
          class="rounded-full border px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          :class="
            selectedIds.includes(site.id)
              ? 'border-sky-700 bg-sky-900/40 text-sky-200'
              : 'border-slate-700 text-slate-400 hover:bg-slate-800'
          "
          :disabled="!selectedIds.includes(site.id) && selectedIds.length >= MAX_SITES"
          @click="toggleSite(site.id)"
        >
          {{ site.name || hostname(site.url) }}
        </button>
      </div>
      <div v-else class="text-sm text-slate-500">No sites yet — add one from the dashboard first.</div>
    </div>

    <div
      v-if="selectedIds.length < 2"
      class="rounded-xl border border-dashed border-slate-800 p-12 text-center text-slate-500"
    >
      Select 2 or more sites above to compare.
    </div>

    <div v-else-if="fetchError" class="rounded-lg border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-300">
      {{ fetchError }}
    </div>

    <div v-else-if="loading && !compareData" class="text-slate-500">Loading…</div>

    <template v-else-if="compareData">
      <CompareSummaryTable :rows="compareData" />

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CompareUptimeBar :rows="compareData" />
        <CompareLatencyBar :rows="compareData" />
      </div>

      <CompareResponseChart :rows="compareData" />

      <CompareLighthouseRadar :rows="compareData" />
    </template>
  </div>
</template>
