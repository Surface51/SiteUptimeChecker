import type { Site } from '#shared/types'
import { getLatestDnsRecordSet, getLatestWhoisRecord, insertDnsRecordSet, insertWhoisRecord, listSites } from './db'
import { runDomainAlerts } from './domainAlerts'
import { runDnsRecords } from './dnsRecords'
import { runWhois } from './whois'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

function hostnameOf(site: Site): string {
  try {
    return new URL(site.url).hostname
  } catch {
    return site.url
  }
}

function hasWhoisThisWeek(siteId: number): boolean {
  const latest = getLatestWhoisRecord(siteId)
  if (!latest) return false
  const checkedAt = new Date(`${latest.checkedAt.replace(' ', 'T')}Z`)
  return Date.now() - checkedAt.getTime() < WEEK_MS
}

function hasDnsThisWeek(siteId: number): boolean {
  const latest = getLatestDnsRecordSet(siteId)
  if (!latest) return false
  const checkedAt = new Date(`${latest.checkedAt.replace(' ', 'T')}Z`)
  return Date.now() - checkedAt.getTime() < WEEK_MS
}

// Dedup concurrent refreshes of the same site (e.g. a double-clicked "Refresh now"), the same
// way lighthouse.ts's inFlightRuns does.
const inFlight = new Map<number, Promise<void>>()

/** Runs the WHOIS + DNS lookups for a site, skipping either that already has data from this week (unless `force`). */
export function refreshDomainInfo(site: Site, opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force) {
    const pending = inFlight.get(site.id)
    if (pending) return pending
  }

  const task = runDomainInfoNow(site, opts)
  inFlight.set(site.id, task)
  task.finally(() => {
    if (inFlight.get(site.id) === task) inFlight.delete(site.id)
  })
  return task
}

async function runDomainInfoNow(site: Site, opts: { force?: boolean }): Promise<void> {
  const hostname = hostnameOf(site)
  const jobs: Promise<void>[] = []

  if (opts.force || !hasWhoisThisWeek(site.id)) {
    jobs.push(
      runWhois(hostname).then((result) => {
        insertWhoisRecord({ siteId: site.id, ...result })
      }),
    )
  }

  if (opts.force || !hasDnsThisWeek(site.id)) {
    jobs.push(
      runDnsRecords(hostname).then((result) => {
        insertDnsRecordSet({ siteId: site.id, ...result })
      }),
    )
  }

  await Promise.allSettled(jobs)

  // Fresh WHOIS/DNS rows are now in place — raise expiry / nameserver-change alerts off them.
  runDomainAlerts(site)
}

let dailyTimer: NodeJS.Timeout | null = null

/**
 * Ticks daily (like the lighthouse scheduler) but `hasWhoisThisWeek`/`hasDnsThisWeek` skip any
 * site that already has a lookup from within the last 7 days, so work actually only happens
 * once a week per site. The daily cadence just means a restart catches up quickly instead of
 * waiting up to a week.
 */
export function startDomainInfoScheduler() {
  for (const site of listSites()) {
    if (!site.enabled) continue
    refreshDomainInfo(site)
  }

  dailyTimer = setInterval(() => {
    for (const site of listSites()) {
      if (!site.enabled) continue
      refreshDomainInfo(site)
    }
  }, DAY_MS)
}

export function stopDomainInfoScheduler() {
  if (dailyTimer) {
    clearInterval(dailyTimer)
    dailyTimer = null
  }
}
