<script setup lang="ts">
import type { SiteSummary } from '#shared/types'
import {
  EXPIRY_WARNING_DAYS,
  formatMs,
  formatPct,
  meanUptime24h,
  openIncidentsCount,
  siteHostname,
  soonestExpiryDays,
  statusCounts,
  worstP95Ms,
} from '~/utils/fleetStats'

const props = withDefaults(
  defineProps<{
    title: string
    sites: SiteSummary[]
    collapsed: boolean
    /** `cards` is the detailed SiteCard, `tiles` a compact FleetTile, `list` the row layout. */
    view?: 'list' | 'tiles' | 'cards'
    large?: boolean
    /** Tags currently filtering the dashboard, highlighted on the cards. */
    activeFilterTags?: string[]
  }>(),
  { view: 'list' },
)
defineEmits<{ toggle: []; 'toggle-pin': [site: SiteSummary]; refresh: []; 'toggle-filter': [tag: string] }>()

const counts = computed(() => statusCounts(props.sites))
const uptime = computed(() => meanUptime24h(props.sites))
const p95 = computed(() => worstP95Ms(props.sites))
const incidents = computed(() => openIncidentsCount(props.sites))
const expiry = computed(() => soonestExpiryDays(props.sites))

function rowState(site: SiteSummary) {
  if (!site.enabled) return 'paused' as const
  if (site.inMaintenance) return 'maintenance' as const
  return undefined
}
</script>

<template>
  <UiCard flush>
    <button
      type="button"
      class="flex w-full cursor-pointer flex-wrap items-center gap-x-6 gap-y-2 border-none bg-transparent px-5 py-4 text-left transition-colors hover:bg-sunken"
      :aria-expanded="!collapsed"
      @click="$emit('toggle')"
    >
      <UiIcon :name="collapsed ? 'chevron_right' : 'expand_more'" :size="20" class="text-tertiary" />
      <span class="font-display text-lg font-semibold text-primary">{{ title }}</span>
      <span class="text-xs text-tertiary">{{ sites.length }} {{ sites.length === 1 ? 'site' : 'sites' }}</span>

      <span class="flex items-center gap-3 text-xs font-medium">
        <span v-if="counts.down" class="inline-flex items-center gap-1 text-down">
          <span class="h-2 w-2 rounded-full bg-down" />{{ counts.down }} down
        </span>
        <span v-if="counts.degraded" class="inline-flex items-center gap-1 text-degraded">
          <span class="h-2 w-2 rounded-full bg-degraded" />{{ counts.degraded }} degraded
        </span>
        <span v-if="counts.up" class="inline-flex items-center gap-1 text-up">
          <span class="h-2 w-2 rounded-full bg-up" />{{ counts.up }} up
        </span>
        <span v-if="counts.paused" class="text-tertiary">{{ counts.paused }} paused</span>
      </span>

      <span class="ml-auto flex items-center gap-5 text-xs text-secondary">
        <span>{{ formatPct(uptime) }} <span class="text-tertiary">uptime</span></span>
        <span>{{ formatMs(p95) }} <span class="text-tertiary">worst p95</span></span>
        <span v-if="incidents" class="font-medium text-down">{{ incidents }} open</span>
        <span v-if="expiry !== null && expiry < EXPIRY_WARNING_DAYS" class="font-medium text-degraded">
          expires {{ expiry }}d
        </span>
      </span>
    </button>

    <div
      v-if="!collapsed && view === 'cards'"
      class="grid grid-cols-1 gap-6 border-t border-border-default p-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]"
    >
      <!-- The star sits top-left; SiteCard's own hover actions own the top-right. -->
      <div v-for="site in sites" :key="site.id" class="relative">
        <SiteCard
          :site="site"
          :active-filter-tags="activeFilterTags"
          @removed="$emit('refresh')"
          @checked="$emit('refresh')"
          @toggle-filter="$emit('toggle-filter', $event)"
        />
        <button
          type="button"
          class="absolute top-3 left-3 cursor-pointer rounded-full border border-border-default bg-raised p-1 transition-colors hover:bg-sunken"
          :class="site.pinned ? 'text-accent' : 'text-tertiary'"
          :aria-label="site.pinned ? 'Unpin site' : 'Pin site'"
          :aria-pressed="site.pinned"
          @click="$emit('toggle-pin', site)"
        >
          <UiIcon :name="site.pinned ? 'star' : 'star_outline'" :size="16" />
        </button>
      </div>
    </div>

    <div
      v-else-if="!collapsed && view === 'tiles'"
      class="grid border-t border-border-default p-4"
      :class="
        large
          ? 'grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4'
          : 'grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3'
      "
    >
      <FleetTile
        v-for="site in sites"
        :key="site.id"
        :site="site"
        :large="large"
        pinnable
        @toggle-pin="$emit('toggle-pin', site)"
      />
    </div>

    <ul v-else-if="!collapsed" class="flex flex-col divide-y divide-border-default border-t border-border-default">
      <li v-for="site in sites" :key="site.id" class="flex items-center">
        <button
          type="button"
          class="ml-3 cursor-pointer rounded-full border-none bg-transparent p-1.5 transition-colors hover:bg-sunken"
          :class="site.pinned ? 'text-accent' : 'text-tertiary'"
          :aria-label="site.pinned ? 'Unpin site' : 'Pin site'"
          :aria-pressed="site.pinned"
          @click="$emit('toggle-pin', site)"
        >
          <UiIcon :name="site.pinned ? 'star' : 'star_outline'" :size="18" />
        </button>

        <NuxtLink
          :to="`/sites/${site.id}`"
          class="flex min-w-0 flex-1 items-center gap-4 py-3 pr-5 pl-2 no-underline transition-colors hover:bg-sunken"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-primary">{{ site.name || siteHostname(site) }}</span>
            <span class="block truncate text-xs text-tertiary">{{ siteHostname(site) }}</span>
          </span>
          <span class="hidden w-36 shrink-0 sm:block">
            <StatusBadge :status="site.latestCheck?.status ?? null" :state="rowState(site)" />
          </span>
          <span class="w-16 shrink-0 text-right text-sm text-secondary sm:w-20">{{ formatPct(site.uptime24h) }}</span>
          <span class="hidden w-20 shrink-0 text-right text-sm text-secondary md:block">
            {{ formatMs(site.latestCheck?.timeTotal ?? null) }}
          </span>
          <span
            class="hidden w-14 shrink-0 text-right text-sm lg:block"
            :class="(site.latestCheck?.sslDaysRemaining ?? 999) < 14 ? 'font-medium text-degraded' : 'text-tertiary'"
          >
            {{ site.latestCheck?.sslDaysRemaining != null ? `${site.latestCheck.sslDaysRemaining}d` : '—' }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </UiCard>
</template>
