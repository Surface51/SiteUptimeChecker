<script setup lang="ts">
import type { FleetTrends } from '#shared/types'

const { sites, pending, error, refresh } = useSites()
const { kiosk, setKiosk, secondsAgo } = useKioskMode(sites, refresh)

useHead({ title: 'Site Uptime' })

const { allTags, selectedTags, toggleFilterTag, filteredSites } = useFleetFilter(sites)
const { query, layout, sortKey, sortOptions, visibleSites, pinnedSites, groups, collapsed, toggleCollapsed, togglePin } =
  useDirectory(filteredSites, refresh)

const { ping: pingProgress } = useLighthouseProgress()
const { push: pushToast } = useToasts()

const showAddForm = ref(false)

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

const incidents = computed(() => filteredSites.value.filter((s) => s.openIncident !== null).length)

// Detailed cards, compact tiles or rows inside each group; remembered per browser.
type View = 'cards' | 'tiles' | 'list'
const VIEW_KEY = 'siteUptime.directoryView'
const view = ref<View>('tiles')

onMounted(() => {
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    if (saved === 'cards' || saved === 'tiles' || saved === 'list') view.value = saved
  } catch {
    // Storage unavailable — keep the default.
  }
})

watch(view, (v) => {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    // Not persisted; still applies for this session.
  }
})

// Trends are secondary to the status wall, so don't hold the page up waiting on them.
type Range = 7 | 30 | 90
const range = ref<Range>(30)

const { data: trends, refresh: refreshTrends } = useFetch<FleetTrends>('/api/fleet/trends', {
  query: { days: range },
  lazy: true,
})

usePoll(() => refreshTrends())

const kpis = useFleetKpis(trends)
</script>

<template>
  <div class="flex flex-col" :class="kiosk ? 'gap-6' : 'gap-9'">
    <div v-if="error" class="rounded-lg border border-down bg-down-tint p-4 text-sm text-down">
      Failed to load sites: {{ error.message }}
    </div>
    <div v-else-if="pending && !sites.length" class="text-tertiary">Loading…</div>
    <UiEmptyState v-else-if="!sites.length" icon="monitor_heart">
      No sites yet. Add one to start monitoring.
    </UiEmptyState>

    <template v-else>
      <!-- Visual order is set with `order-*`: banner, then (kiosk) the tile wall first and the
           incidents/expiry/trends underneath, or (normal) incidents/expiry/trends above the sites. -->
      <FleetBanner
        class="order-1"
        :sites="filteredSites"
        :kiosk="kiosk"
        :seconds-ago="secondsAgo"
        show-counts
        @toggle-kiosk="setKiosk(!kiosk)"
      />

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2" :class="kiosk ? 'order-3' : 'order-2'">
        <OpenIncidentsPanel v-if="incidents" :sites="filteredSites" />
        <ExpiryBar :sites="filteredSites" :class="incidents ? '' : 'lg:col-span-2'" />
      </div>

      <section class="flex flex-col gap-4" :class="kiosk ? 'order-4' : 'order-3'">
        <UiSectionHeading>
          Trends
          <template #actions>
            <UiSegmentedControl
              v-model="range"
              :options="[
                { label: '7d', value: 7 },
                { label: '30d', value: 30 },
                { label: '90d', value: 90 },
              ]"
            />
          </template>
        </UiSectionHeading>

        <UiCard padding="px-8 py-7">
          <div v-if="trends" class="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
            <FleetKpi v-for="k in kpis" :key="k.label" :label="k.label" :value="k.value" :delta="k.delta" />
          </div>
          <div v-else class="text-sm text-tertiary">Loading…</div>
        </UiCard>

        <div v-if="trends" class="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <UiCard>
            <UiSectionHeading as="h3" class="mb-3">Uptime</UiSectionHeading>
            <FleetUptimeChart :series="trends.series" />
          </UiCard>
          <UiCard>
            <UiSectionHeading as="h3" class="mb-3">Response time (worst p95)</UiSectionHeading>
            <FleetLatencyChart :series="trends.series" />
          </UiCard>
          <UiCard>
            <UiSectionHeading as="h3" class="mb-3">Incidents per day</UiSectionHeading>
            <FleetIncidentsChart :series="trends.series" />
          </UiCard>
        </div>
      </section>

      <section class="flex flex-col" :class="kiosk ? 'order-2 gap-5' : 'order-4 gap-4'">
        <template v-if="!kiosk">
          <UiSectionHeading>
            Sites
            <template #actions>
              <UiButton variant="ghost" :disabled="runningAllLighthouse" icon="speed" @click="runAllLighthouse">
                {{ runningAllLighthouse ? 'Queuing…' : 'Run all Lighthouse' }}
              </UiButton>
              <UiButton variant="secondary" :icon="showAddForm ? 'close' : 'add'" @click="showAddForm = !showAddForm">
                {{ showAddForm ? 'Cancel' : 'Add site' }}
              </UiButton>
              <UiButton variant="primary" :disabled="checkingAll" icon="refresh" @click="checkAllNow">
                {{ checkingAll ? 'Checking all…' : 'Check all sites' }}
              </UiButton>
            </template>
          </UiSectionHeading>

          <AddSiteForm
            v-if="showAddForm"
            @added="
              () => {
                refresh()
                showAddForm = false
              }
            "
          />

          <div class="flex flex-wrap items-end gap-4">
            <div class="min-w-[240px] flex-1">
              <UiInput v-model="query" placeholder="Search sites by name or URL" />
            </div>
            <UiSegmentedControl
              v-model="layout"
              :options="[
                { label: 'By tag', value: 'tag', icon: 'folder' },
                { label: 'Flat', value: 'flat', icon: 'list' },
              ]"
            />
            <UiSegmentedControl
              v-model="view"
              :options="[
                { label: 'Cards', value: 'cards', icon: 'view_agenda' },
                { label: 'Tiles', value: 'tiles', icon: 'grid_view' },
                { label: 'List', value: 'list', icon: 'table_rows' },
              ]"
            />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <template v-if="allTags.length">
              <span class="mr-1 text-xs tracking-wide text-tertiary uppercase">Filter</span>
              <UiChip
                v-for="tag in allTags"
                :key="tag"
                size="sm"
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
            </template>
            <div class="ml-auto flex flex-wrap gap-2">
              <UiChip
                v-for="opt in sortOptions"
                :key="opt.value"
                size="sm"
                :active="sortKey === opt.value"
                @click="sortKey = opt.value"
              >
                Sort: {{ opt.label }}
              </UiChip>
            </div>
          </div>
        </template>

        <UiEmptyState v-if="!visibleSites.length" icon="filter_alt_off">No sites match.</UiEmptyState>
        <template v-else>
          <DirectoryGroup
            v-if="pinnedSites.length"
            title="Pinned"
            :sites="pinnedSites"
            :view="kiosk ? 'tiles' : view"
            :large="kiosk"
            :active-filter-tags="selectedTags"
            :collapsed="collapsed.includes('pinned')"
            @toggle="toggleCollapsed('pinned')"
            @toggle-pin="togglePin"
            @refresh="refresh"
            @toggle-filter="toggleFilterTag"
          />
          <DirectoryGroup
            v-for="group in groups"
            :key="group.key"
            :title="group.title"
            :sites="group.sites"
            :view="kiosk ? 'tiles' : view"
            :large="kiosk"
            :active-filter-tags="selectedTags"
            :collapsed="collapsed.includes(group.key)"
            @toggle="toggleCollapsed(group.key)"
            @toggle-pin="togglePin"
            @refresh="refresh"
            @toggle-filter="toggleFilterTag"
          />
        </template>
      </section>
    </template>
  </div>
</template>
