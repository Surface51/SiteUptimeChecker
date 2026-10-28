<script setup lang="ts">
import type { SiteSummary } from '#shared/types'
import {
  EXPIRY_WARNING_DAYS,
  avgResponseMs as calcAvgResponseMs,
  certsExpiringCount as calcCertsExpiring,
  domainsExpiringCount as calcDomainsExpiring,
  expiringSitesCount as calcExpiringSites,
  fleetMttrSeconds as calcFleetMttr,
  formatShortDuration,
  formatMs,
  formatPct,
  meanUptime24h,
  meanUptime7d,
  openIncidentsCount as calcOpenIncidents,
  statusCounts,
  worstP95Ms as calcWorstP95,
} from '~/utils/fleetStats'

const props = defineProps<{ sites: SiteSummary[] }>()

const counts = computed(() => statusCounts(props.sites))
const upCount = computed(() => counts.value.up)
const degradedCount = computed(() => counts.value.degraded)
const downCount = computed(() => counts.value.down)
const pausedCount = computed(() => counts.value.paused)

const overallUptime = computed(() => meanUptime24h(props.sites))
const overallUptime7d = computed(() => meanUptime7d(props.sites))
const avgResponseMs = computed(() => calcAvgResponseMs(props.sites))
const worstP95Ms = computed(() => calcWorstP95(props.sites))
const openIncidentsCount = computed(() => calcOpenIncidents(props.sites))
const fleetMttrSeconds = computed(() => calcFleetMttr(props.sites))
const certsExpiringCount = computed(() => calcCertsExpiring(props.sites))
const domainsExpiringCount = computed(() => calcDomainsExpiring(props.sites))
const expiringSitesCount = computed(() => calcExpiringSites(props.sites))
</script>

<template>
  <UiCard padding="px-8 py-7">
    <div class="grid grid-cols-2 gap-6 sm:grid-cols-4">
      <UiStatBlock :value="sites.length" label="Sites monitored" icon="dns" />
      <UiStatBlock :value="upCount" label="Up" icon="check_circle" value-class="text-up" />
      <UiStatBlock :value="degradedCount" label="Degraded" icon="warning" value-class="text-degraded" />
      <UiStatBlock :value="downCount" label="Down" icon="error" value-class="text-down" />
      <UiStatBlock
        :value="overallUptime === null ? '—' : formatPct(overallUptime)"
        label="Avg uptime (24h)"
        icon="show_chart"
        :hint="overallUptime7d === null ? undefined : `7d ${formatPct(overallUptime7d)}`"
      />
      <UiStatBlock
        :value="formatMs(avgResponseMs)"
        label="Avg response (24h)"
        icon="speed"
        :hint="worstP95Ms === null ? undefined : `p95 worst ${formatMs(worstP95Ms)}`"
      />
      <UiStatBlock
        :value="openIncidentsCount"
        label="Open incidents"
        icon="report"
        :value-class="openIncidentsCount ? 'text-down' : 'text-primary'"
        :hint="fleetMttrSeconds === null ? undefined : `MTTR ${formatShortDuration(fleetMttrSeconds)} (30d)`"
      />
      <UiStatBlock
        :value="expiringSitesCount"
        :label="`Expiring ≤${EXPIRY_WARNING_DAYS}d`"
        icon="event_busy"
        :value-class="expiringSitesCount ? 'text-degraded' : 'text-primary'"
        :hint="`${certsExpiringCount} certs · ${domainsExpiringCount} domains`"
      />
    </div>
    <p v-if="pausedCount" class="mt-5 text-sm text-tertiary">{{ pausedCount }} paused</p>
  </UiCard>
</template>
