<script setup lang="ts">
import type { CheckStatus, SiteSummary } from '#shared/types'

const { sites, pending, error, refresh } = useSites()
const { ping: pingProgress } = useLighthouseProgress()
const { push: pushToast } = useToasts()

useHead({ title: 'Site Uptime' })

const checkingAll = ref(false)
async function checkAllNow() {
  checkingAll.value = true
  try {
    const result = await $fetch<{ checked: number; failed: number }>('/api/sites/check-all', { method: 'POST' })
    pushToast(
      result.failed > 0 ? `Checked ${result.checked} sites, ${result.failed} failed` : `Checked ${result.checked} sites`,
      result.failed > 0 ? 'warning' : 'success',
    )
    await refresh()
  } finally {
    checkingAll.value = false
  }
}

const runningAllLighthouse = ref(false)
async function runAllLighthouse() {
  runningAllLighthouse.value = true
  pingProgress()
  try {
    const result = await $fetch<{ queued: number }>('/api/lighthouse/run-all', { method: 'POST' })
    pushToast(`Queued ${result.queued} Lighthouse reports`, 'info')
  } finally {
    runningAllLighthouse.value = false
  }
}

type ViewMode = 'cards' | 'table'
const viewMode = ref<ViewMode>('cards')

onMounted(() => {
  const saved = localStorage.getItem('siteUptime.viewMode')
  if (saved === 'cards' || saved === 'table') viewMode.value = saved
})

watch(viewMode, (mode) => {
  localStorage.setItem('siteUptime.viewMode', mode)
})

type SortKey = 'status' | 'uptime24h' | 'response'
const sortKey = ref<SortKey>('status')

function statusRank(status: CheckStatus | null | undefined): number {
  switch (status) {
    case 'down':
      return 0
    case 'degraded':
      return 1
    case 'up':
      return 2
    default:
      return 3
  }
}

const sortedCardSites = computed(() => {
  const list = [...sites.value]
  list.sort((a: SiteSummary, b: SiteSummary) => {
    switch (sortKey.value) {
      case 'uptime24h':
        return (b.uptime24h ?? -1) - (a.uptime24h ?? -1)
      case 'response':
        return (a.latestCheck?.timeTotal ?? Infinity) - (b.latestCheck?.timeTotal ?? Infinity)
      default:
        return statusRank(a.latestCheck?.status) - statusRank(b.latestCheck?.status)
    }
  })
  return list
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <AddSiteForm @added="refresh" />

    <div v-if="error" class="rounded-lg border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-300">
      Failed to load sites: {{ error.message }}
    </div>

    <div v-else-if="pending && !sites.length" class="text-slate-500">Loading…</div>

    <div v-else-if="!sites.length" class="rounded-xl border border-dashed border-slate-800 p-12 text-center text-slate-500">
      No sites yet. Add one above to start monitoring.
    </div>

    <template v-else>
      <SummaryBar :sites="sites" />

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FleetStatusDonut :sites="sites" />
        <UptimeRankingBar class="lg:col-span-1" :sites="sites" />
        <SslExpiryBar class="lg:col-span-1" :sites="sites" />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          :disabled="checkingAll"
          class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          @click="checkAllNow"
        >
          {{ checkingAll ? 'Checking all…' : 'Check all sites' }}
        </button>
        <button
          type="button"
          :disabled="runningAllLighthouse"
          class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          @click="runAllLighthouse"
        >
          {{ runningAllLighthouse ? 'Queuing…' : 'Run all Lighthouse reports' }}
        </button>
      </div>

      <div class="flex items-center justify-between">
        <div v-if="viewMode === 'cards'" class="flex gap-1 rounded-md border border-slate-800 p-0.5 text-xs">
          <button
            v-for="opt in [
              { label: 'Status', value: 'status' as const },
              { label: 'Uptime', value: 'uptime24h' as const },
              { label: 'Response', value: 'response' as const },
            ]"
            :key="opt.value"
            type="button"
            class="rounded px-2.5 py-1"
            :class="sortKey === opt.value ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
            @click="sortKey = opt.value"
          >
            Sort: {{ opt.label }}
          </button>
        </div>
        <div v-else />

        <div class="flex gap-1 rounded-md border border-slate-800 p-0.5 text-xs">
          <button
            type="button"
            class="rounded px-2.5 py-1"
            :class="viewMode === 'cards' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
            @click="viewMode = 'cards'"
          >
            Cards
          </button>
          <button
            type="button"
            class="rounded px-2.5 py-1"
            :class="viewMode === 'table' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
            @click="viewMode = 'table'"
          >
            Table
          </button>
        </div>
      </div>

      <div v-if="viewMode === 'cards'" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SiteCard v-for="site in sortedCardSites" :key="site.id" :site="site" @removed="refresh" @checked="refresh" />
      </div>
      <SitesTable v-else :sites="sites" @removed="refresh" @checked="refresh" />
    </template>
  </div>
</template>
