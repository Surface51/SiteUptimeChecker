import type { CheckStatus, SiteSummary } from '#shared/types'

/** Days-to-expiry below which a cert or domain counts as "expiring". */
export const EXPIRY_WARNING_DAYS = 30

export function statusRank(status: CheckStatus | null | undefined): number {
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

export interface StatusCounts {
  up: number
  degraded: number
  down: number
  paused: number
}

export function statusCounts(sites: SiteSummary[]): StatusCounts {
  const enabled = sites.filter((s) => s.enabled)
  const count = (status: CheckStatus) => enabled.filter((s) => s.latestCheck?.status === status).length
  return {
    up: count('up'),
    degraded: count('degraded'),
    down: count('down'),
    paused: sites.length - enabled.length,
  }
}

function meanOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null)
  if (!present.length) return null
  return present.reduce((a, b) => a + b, 0) / present.length
}

export const meanUptime24h = (sites: SiteSummary[]) => meanOf(sites.map((s) => s.uptime24h))
export const meanUptime7d = (sites: SiteSummary[]) => meanOf(sites.map((s) => s.uptime7d))

// Check-count-weighted, not a mean of per-site averages — a site with 10x the traffic shouldn't
// count the same as one with a handful of checks.
export function avgResponseMs(sites: SiteSummary[]): number | null {
  const withChecks = sites.filter((s) => s.checkCount24h > 0)
  const totalChecks = withChecks.reduce((sum, s) => sum + s.checkCount24h, 0)
  if (!totalChecks) return null
  const weighted = withChecks.reduce((sum, s) => sum + (s.avgMs24h ?? 0) * s.checkCount24h, 0)
  return weighted / totalChecks
}

// The single worst p95 across the fleet — a mean of per-site p95s would hide the one slow site.
export function worstP95Ms(sites: SiteSummary[]): number | null {
  const values = sites.map((s) => s.p95Ms24h).filter((v): v is number => v !== null)
  if (!values.length) return null
  return Math.max(...values)
}

export const openIncidentsCount = (sites: SiteSummary[]) => sites.filter((s) => s.openIncident !== null).length

// Fleet MTTR over the trailing 30 days — summed recovery time over summed closed incidents, so
// sites with more incidents naturally weigh more than a mean-of-means would let them.
export function fleetMttrSeconds(sites: SiteSummary[]): number | null {
  const totalClosed = sites.reduce((sum, s) => sum + s.incidents30d.closed, 0)
  if (!totalClosed) return null
  const totalRecovery = sites.reduce((sum, s) => sum + s.incidents30d.recoverySeconds, 0)
  return totalRecovery / totalClosed
}

const certExpiring = (s: SiteSummary) => {
  const d = s.latestCheck?.sslDaysRemaining
  return d !== null && d !== undefined && d < EXPIRY_WARNING_DAYS
}
const domainExpiring = (s: SiteSummary) => s.domainDaysRemaining !== null && s.domainDaysRemaining < EXPIRY_WARNING_DAYS

export const certsExpiringCount = (sites: SiteSummary[]) => sites.filter(certExpiring).length
export const domainsExpiringCount = (sites: SiteSummary[]) => sites.filter(domainExpiring).length
export const expiringSitesCount = (sites: SiteSummary[]) =>
  sites.filter((s) => certExpiring(s) || domainExpiring(s)).length

/** Soonest cert or domain expiry across the sites, in days; null when none is known. */
export function soonestExpiryDays(sites: SiteSummary[]): number | null {
  const days = sites.flatMap((s) => [s.latestCheck?.sslDaysRemaining ?? null, s.domainDaysRemaining])
  const present = days.filter((d): d is number => d !== null)
  return present.length ? Math.min(...present) : null
}

export function formatPct(v: number | null) {
  return v === null ? '—' : `${v.toFixed(2)}%`
}

export function formatMs(v: number | null) {
  if (v === null) return '—'
  return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`
}

export function formatShortDuration(seconds: number | null) {
  if (seconds === null) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

export function siteHostname(site: Pick<SiteSummary, 'url'>) {
  try {
    return new URL(site.url).hostname
  } catch {
    return site.url
  }
}
