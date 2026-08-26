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

const showAddForm = ref(false)

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

const allTags = computed(() => {
  const names = new Set<string>()
  for (const site of sites.value) {
    for (const tag of site.tags) names.add(tag)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
})

const selectedTags = ref<string[]>([])

function toggleFilterTag(tag: string) {
  const idx = selectedTags.value.findIndex((t) => t.toLowerCase() === tag.toLowerCase())
  if (idx === -1) {
    selectedTags.value = [...selectedTags.value, tag]
  } else {
    selectedTags.value = selectedTags.value.filter((_, i) => i !== idx)
  }
}

// Sites matching ANY selected tag — narrows the fleet without needing every tag present.
const filteredSites = computed(() => {
  if (!selectedTags.value.length) return sites.value
  const wanted = new Set(selectedTags.value.map((t) => t.toLowerCase()))
  return sites.value.filter((s) => s.tags.some((t) => wanted.has(t.toLowerCase())))
})

const sortedCardSites = computed(() => {
  const list = [...filteredSites.value]
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
  <div class="flex flex-col gap-9">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-4xl font-bold tracking-tight text-primary">Uptime Dashboard</h1>
        <p class="mt-1.5 text-base text-secondary">
          Monitoring {{ sites.length }} {{ sites.length === 1 ? 'site' : 'sites' }}.
        </p>
      </div>
      <div class="flex flex-wrap gap-2.5">
        <UiButton variant="ghost" :disabled="runningAllLighthouse" icon="speed" @click="runAllLighthouse">
          {{ runningAllLighthouse ? 'Queuing…' : 'Run all Lighthouse' }}
        </UiButton>
        <UiButton variant="secondary" :icon="showAddForm ? 'close' : 'add'" @click="showAddForm = !showAddForm">
          {{ showAddForm ? 'Cancel' : 'Add site' }}
        </UiButton>
        <UiButton variant="primary" :disabled="checkingAll" icon="refresh" @click="checkAllNow">
          {{ checkingAll ? 'Checking all…' : 'Check all sites' }}
        </UiButton>
      </div>
    </div>

    <AddSiteForm v-if="showAddForm" @added="() => { refresh(); showAddForm = false }" />

    <div v-if="error" class="rounded-lg border border-down bg-down-tint p-4 text-sm text-down">
      Failed to load sites: {{ error.message }}
    </div>

    <div v-else-if="pending && !sites.length" class="text-tertiary">Loading…</div>

    <UiEmptyState v-else-if="!sites.length" icon="monitor_heart">
      No sites yet. Add one to start monitoring.
    </UiEmptyState>

    <template v-else>
      <SummaryBar :sites="sites" />

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FleetStatusDonut :sites="sites" />
        <SslExpiryBar :sites="sites" />
      </div>

      <div v-if="allTags.length" class="flex flex-wrap items-center gap-2">
        <span class="mr-1 text-xs tracking-wide text-tertiary uppercase">Filter</span>
        <UiChip
          v-for="tag in allTags"
          :key="tag"
          :active="selectedTags.some((t) => t.toLowerCase() === tag.toLowerCase())"
          @click="toggleFilterTag(tag)"
        >
          {{ tag }}
        </UiChip>
        <button
          v-if="selectedTags.length"
          type="button"
          class="cursor-pointer border-none bg-transparent text-sm text-tertiary transition-colors hover:text-primary"
          @click="selectedTags = []"
        >
          Clear
        </button>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-4">
        <div v-if="viewMode === 'cards'" class="flex flex-wrap gap-2">
          <UiChip
            v-for="opt in [
              { label: 'Status', value: 'status' as const },
              { label: 'Uptime', value: 'uptime24h' as const },
              { label: 'Response', value: 'response' as const },
            ]"
            :key="opt.value"
            :active="sortKey === opt.value"
            size="sm"
            @click="sortKey = opt.value"
          >
            Sort: {{ opt.label }}
          </UiChip>
        </div>
        <div v-else />

        <div class="ml-auto">
          <UiSegmentedControl
            v-model="viewMode"
            :options="[
              { label: 'Cards', value: 'cards', icon: 'grid_view' },
              { label: 'Table', value: 'table', icon: 'table_rows' },
            ]"
          />
        </div>
      </div>

      <UiEmptyState v-if="!sortedCardSites.length" icon="filter_alt_off">
        No sites match the selected tags.
      </UiEmptyState>
      <div
        v-else-if="viewMode === 'cards'"
        class="grid grid-cols-1 gap-6 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]"
      >
        <SiteCard
          v-for="site in sortedCardSites"
          :key="site.id"
          :site="site"
          :active-filter-tags="selectedTags"
          @removed="refresh"
          @checked="refresh"
          @toggle-filter="toggleFilterTag"
        />
      </div>
      <SitesTable v-else :sites="filteredSites" @removed="refresh" @checked="refresh" />
    </template>
  </div>
</template>
