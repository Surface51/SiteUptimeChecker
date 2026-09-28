<script setup lang="ts">
import type { SiteSummary } from '#shared/types'

const props = defineProps<{ sites: SiteSummary[] }>()

const upCount = computed(() => props.sites.filter((s) => s.enabled && s.latestCheck?.status === 'up').length)
const degradedCount = computed(() => props.sites.filter((s) => s.enabled && s.latestCheck?.status === 'degraded').length)
const downCount = computed(() => props.sites.filter((s) => s.enabled && s.latestCheck?.status === 'down').length)
const pausedCount = computed(() => props.sites.filter((s) => !s.enabled).length)

const overallUptime = computed(() => {
  const values = props.sites.map((s) => s.uptime24h).filter((v): v is number => v !== null)
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
})

const overallUptime7d = computed(() => {
  const values = props.sites.map((s) => s.uptime7d).filter((v): v is number => v !== null)
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
})

// Check-count-weighted, not a mean of per-site averages — a site with 10x the traffic shouldn't
// count the same as one with a handful of checks.
const avgResponseMs = computed(() => {
  const withChecks = props.sites.filter((s) => s.checkCount24h > 0)
  const totalChecks = withChecks.reduce((sum, s) => sum + s.checkCount24h, 0)
  if (!totalChecks) return null
  const weighted = withChecks.reduce((sum, s) => sum + (s.avgMs24h ?? 0) * s.checkCount24h, 0)
  return weighted / totalChecks
})

// The single worst p95 across the fleet — a mean of per-site p95s would hide the one slow site.
const worstP95Ms = computed(() => {
  const values = props.sites.map((s) => s.p95Ms24h).filter((v): v is number => v !== null)
  if (!values.length) return null
  return Math.max(...values)
})

const openIncidentsCount = computed(() => props.sites.filter((s) => s.openIncident !== null).length)

// Fleet MTTR over the trailing 30 days — summed recovery time over summed closed incidents, so
// sites with more incidents naturally weigh more than a mean-of-means would let them.
const fleetMttrSeconds = computed(() => {
  const totalClosed = props.sites.reduce((sum, s) => sum + s.incidents30d.closed, 0)
  if (!totalClosed) return null
  const totalRecovery = props.sites.reduce((sum, s) => sum + s.incidents30d.recoverySeconds, 0)
  return totalRecovery / totalClosed
})

const EXPIRY_WARNING_DAYS = 30

const certsExpiringCount = computed(
  () =>
    props.sites.filter((s) => {
      const d = s.latestCheck?.sslDaysRemaining
      return d !== null && d !== undefined && d < EXPIRY_WARNING_DAYS
    }).length,
)

const domainsExpiringCount = computed(
  () => props.sites.filter((s) => s.domainDaysRemaining !== null && s.domainDaysRemaining < EXPIRY_WARNING_DAYS).length,
)

const expiringSitesCount = computed(() => {
  const certSites = new Set(
    props.sites
      .filter((s) => {
        const d = s.latestCheck?.sslDaysRemaining
        return d !== null && d !== undefined && d < EXPIRY_WARNING_DAYS
      })
      .map((s) => s.id),
  )
  for (const s of props.sites) {
    if (s.domainDaysRemaining !== null && s.domainDaysRemaining < EXPIRY_WARNING_DAYS) certSites.add(s.id)
  }
  return certSites.size
})

function formatPct(v: number | null) {
  return v === null ? '—' : `${v.toFixed(2)}%`
}

function formatMs(v: number | null) {
  if (v === null) return '—'
  return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}
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
        :hint="fleetMttrSeconds === null ? undefined : `MTTR ${formatDuration(fleetMttrSeconds)} (30d)`"
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
