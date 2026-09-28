import dns from 'node:dns'
import type { Site, SubdomainSource } from '#shared/types'
import { MONITOR_HEADERS } from './checks/httpCheck'
import { sslCheck } from './checks/sslCheck'
import { markSubdomainScan, upsertSubdomain } from './db'
import { SUBDOMAIN_WORDLIST } from './subdomainWordlist'

const dnsPromises = dns.promises

const CONCURRENCY = 8
const PROBE_TIMEOUT_MS = 10_000
const CT_TIMEOUT_MS = 15_000
const CT_URL_LIMIT = 500

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim()
  if (!raw) return defaultValue
  return raw !== '0' && raw.toLowerCase() !== 'false'
}

const SCAN_ENABLED = envFlag('UPTIME_SUBDOMAIN_SCAN', true)
const CT_ENABLED = envFlag('UPTIME_SUBDOMAIN_CT', true)
const MAX_HOSTS = Number(process.env.UPTIME_SUBDOMAIN_MAX_HOSTS) || 100

function describeError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    return (err as any).message
  }
  return 'Request failed'
}

/** The root domain a subdomain scan probes against — strips a leading `www.`, nothing more.
 * No public-suffix list: `www.example.co.uk` correctly becomes `example.co.uk`, but a site
 * already hosted at a third-level name (`app.example.co.uk`) scans under its own name. */
export function scanRoot(hostname: string): string {
  const h = hostname.toLowerCase()
  return h.startsWith('www.') ? h.slice(4) : h
}

/** Simplified shapes of the `node:dns` resolvers this module calls — just the plain-hostname
 * overload, since options are never passed. Lets tests inject stubs without matching Node's full
 * overloaded signatures. */
type Resolve4Fn = (hostname: string) => Promise<string[]>
type Resolve6Fn = (hostname: string) => Promise<string[]>
type ResolveCnameFn = (hostname: string) => Promise<string[]>
type SslCheckFn = typeof sslCheck

export interface DiscoveryTransports {
  sslCheck?: SslCheckFn
  resolve4?: Resolve4Fn
  resolve6?: Resolve6Fn
  resolveCname?: ResolveCnameFn
  fetchCt?: (root: string) => Promise<{ name_value: string }[]>
}

/** True when a random, never-issued label under `root` resolves — a sign of wildcard DNS, which
 * would otherwise make every wordlist label look like a real subdomain. */
export async function detectWildcard(root: string, resolve4: Resolve4Fn = dnsPromises.resolve4): Promise<boolean> {
  const probe = `zz${Math.random().toString(36).slice(2, 10)}-uptime-probe.${root}`
  try {
    const addrs = await resolve4(probe)
    return addrs.length > 0
  } catch {
    return false
  }
}

async function defaultFetchCt(root: string): Promise<{ name_value: string }[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CT_TIMEOUT_MS)
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(`%.${root}`)}&output=json`, {
      headers: { ...MONITOR_HEADERS, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return []
    return (await res.json()) as { name_value: string }[]
  } finally {
    clearTimeout(timer)
  }
}

function addCandidate(found: Map<string, Set<SubdomainSource>>, root: string, hostname: string, source: SubdomainSource) {
  const h = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!h || h === root || !h.endsWith(`.${root}`) || h.startsWith('*.')) return
  const set = found.get(h) ?? new Set<SubdomainSource>()
  set.add(source)
  found.set(h, set)
}

/**
 * Gathers subdomain candidates for `root` from certificate SANs, a DNS wordlist probe and (by
 * default) Certificate Transparency logs, each source isolated behind `Promise.allSettled` so one
 * failing (crt.sh down, DNS timeouts) never drops the others. Returns every candidate found —
 * callers rank and cap with `rankAndCapCandidates` before probing.
 */
export async function discoverSubdomains(
  root: string,
  opts: { includeWordlist?: boolean; includeCt?: boolean; transports?: DiscoveryTransports } = {},
): Promise<Map<string, Set<SubdomainSource>>> {
  const t = opts.transports ?? {}
  const sslCheckFn = t.sslCheck ?? sslCheck
  const resolve4 = t.resolve4 ?? dnsPromises.resolve4
  const resolve6 = t.resolve6 ?? dnsPromises.resolve6
  const resolveCname = t.resolveCname ?? dnsPromises.resolveCname
  const fetchCtFn = t.fetchCt ?? defaultFetchCt

  const found = new Map<string, Set<SubdomainSource>>()
  const add = (hostname: string, source: SubdomainSource) => addCandidate(found, root, hostname, source)
  const jobs: Promise<void>[] = []

  jobs.push(
    sslCheckFn(root)
      .then((info) => {
        for (const name of info?.altNames ?? []) add(name, 'cert')
      })
      .catch(() => {}),
  )

  if (opts.includeCt !== false) {
    jobs.push(
      fetchCtFn(root)
        .then((entries) => {
          for (const entry of entries.slice(0, CT_URL_LIMIT)) {
            for (const line of (entry.name_value ?? '').split('\n')) add(line, 'ct')
          }
        })
        .catch(() => {}),
    )
  }

  if (opts.includeWordlist !== false) {
    jobs.push(
      (async () => {
        for (let i = 0; i < SUBDOMAIN_WORDLIST.length; i += CONCURRENCY) {
          const batch = SUBDOMAIN_WORDLIST.slice(i, i + CONCURRENCY)
          await Promise.all(
            batch.map(async (label) => {
              const hostname = `${label}.${root}`
              const results = await Promise.allSettled([resolve4(hostname), resolve6(hostname), resolveCname(hostname)])
              if (results.some((r) => r.status === 'fulfilled')) add(hostname, 'dns')
            }),
          )
        }
      })(),
    )
  }

  await Promise.allSettled(jobs)
  return found
}

/**
 * Bounds how many hosts one scan probes: cert/DNS candidates (directly observed) sort ahead of
 * CT-only ones (a name that was merely issued a cert once, possibly years ago and never live),
 * then alphabetically, so a domain with a large CT history stays predictable.
 */
export function rankAndCapCandidates(
  found: Map<string, Set<SubdomainSource>>,
  maxHosts: number = MAX_HOSTS,
): Map<string, Set<SubdomainSource>> {
  const entries = [...found.entries()]
  entries.sort(([hostA, sourcesA], [hostB, sourcesB]) => {
    const rankOf = (sources: Set<SubdomainSource>) => (sources.has('cert') || sources.has('dns') ? 0 : 1)
    const diff = rankOf(sourcesA) - rankOf(sourcesB)
    return diff !== 0 ? diff : hostA.localeCompare(hostB)
  })
  return new Map(entries.slice(0, maxHosts))
}

export interface SubdomainProbe {
  hostname: string
  resolves: boolean
  addresses: string[]
  cname: string | null
  httpStatus: number | null
  finalUrl: string | null
  timeTotal: number | null
  sslValid: boolean | null
  sslIssuer: string | null
  sslExpiresAt: string | null
  sslDaysRemaining: number | null
  error: string | null
}

export interface ProbeTransports {
  resolve4?: Resolve4Fn
  resolve6?: Resolve6Fn
  resolveCname?: ResolveCnameFn
  fetchFn?: typeof fetch
  sslCheck?: SslCheckFn
}

/**
 * DNS resolution, then (only if it resolves) one manual-redirect HTTP request and a cert probe —
 * the same probe identity (`MONITOR_HEADERS`) a real check uses, so the traffic reads as
 * synthetic monitoring on the target side too. Never writes a `checks` row, never opens an
 * incident: the caller persists the result as a status snapshot via `upsertSubdomain`.
 */
export async function probeSubdomain(hostname: string, transports: ProbeTransports = {}): Promise<SubdomainProbe> {
  const resolve4 = transports.resolve4 ?? dnsPromises.resolve4
  const resolve6 = transports.resolve6 ?? dnsPromises.resolve6
  const resolveCname = transports.resolveCname ?? dnsPromises.resolveCname
  const fetchFn = transports.fetchFn ?? fetch
  const sslCheckFn = transports.sslCheck ?? sslCheck

  const [a, aaaa, cnameResult] = await Promise.allSettled([resolve4(hostname), resolve6(hostname), resolveCname(hostname)])
  const addresses = [
    ...(a.status === 'fulfilled' ? a.value : []),
    ...(aaaa.status === 'fulfilled' ? aaaa.value : []),
  ]
  const cname = cnameResult.status === 'fulfilled' ? (cnameResult.value[0] ?? null) : null
  const resolves = addresses.length > 0 || cname !== null

  if (!resolves) {
    const error = a.status === 'rejected' ? describeError(a.reason) : null
    return {
      hostname,
      resolves: false,
      addresses: [],
      cname: null,
      httpStatus: null,
      finalUrl: null,
      timeTotal: null,
      sslValid: null,
      sslIssuer: null,
      sslExpiresAt: null,
      sslDaysRemaining: null,
      error,
    }
  }

  let httpStatus: number | null = null
  let finalUrl: string | null = null
  let timeTotal: number | null = null
  let error: string | null = null

  const t0 = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetchFn(`https://${hostname}/`, {
      method: 'GET',
      redirect: 'manual',
      headers: MONITOR_HEADERS,
      signal: controller.signal,
    })
    httpStatus = res.status
    finalUrl = res.url || `https://${hostname}/`
    timeTotal = performance.now() - t0
  } catch (err) {
    error = describeError(err)
  } finally {
    clearTimeout(timer)
  }

  const ssl = await sslCheckFn(hostname).catch(() => null)

  return {
    hostname,
    resolves: true,
    addresses,
    cname,
    httpStatus,
    finalUrl,
    timeTotal,
    sslValid: ssl?.valid ?? null,
    sslIssuer: ssl?.issuer ?? null,
    sslExpiresAt: ssl?.expiresAt ?? null,
    sslDaysRemaining: ssl?.daysRemaining ?? null,
    error,
  }
}

function hostnameOf(site: Site): string {
  try {
    return new URL(site.url).hostname
  } catch {
    return site.url
  }
}

/**
 * Discovers and probes every subdomain candidate for a site, in `CONCURRENCY`-wide batches, and
 * upserts each as a `site_subdomains` row. No `checks` rows, no incidents, no notifications.
 * Does not gate on freshness itself — see `hasSubdomainScanThisWeek` in domainInfo.ts, which
 * decides whether the weekly scheduler calls this at all.
 */
export async function runSubdomainScan(site: Site): Promise<void> {
  if (!SCAN_ENABLED) return

  const root = scanRoot(hostnameOf(site))
  const wildcard = await detectWildcard(root)
  const found = await discoverSubdomains(root, { includeWordlist: !wildcard, includeCt: CT_ENABLED })
  const candidates = [...rankAndCapCandidates(found, MAX_HOSTS).entries()]

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async ([hostname, sources]) => {
        const probe = await probeSubdomain(hostname)
        upsertSubdomain({
          siteId: site.id,
          hostname,
          sources: [...sources],
          resolves: probe.resolves,
          addresses: probe.addresses,
          cname: probe.cname,
          httpStatus: probe.httpStatus,
          finalUrl: probe.finalUrl,
          timeTotal: probe.timeTotal,
          sslValid: probe.sslValid,
          sslIssuer: probe.sslIssuer,
          sslExpiresAt: probe.sslExpiresAt,
          sslDaysRemaining: probe.sslDaysRemaining,
          error: probe.error,
        })
      }),
    )
  }

  markSubdomainScan(site.id, wildcard)
}

// Dedup concurrent scans of the same site (a double-clicked "Rescan" racing the weekly
// scheduler), the same way domainInfo.ts's refreshDomainInfo and lighthouse.ts's inFlightRuns do.
const inFlight = new Map<number, Promise<void>>()

export function refreshSubdomains(site: Site, opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force) {
    const pending = inFlight.get(site.id)
    if (pending) return pending
  }

  const task = runSubdomainScan(site)
  inFlight.set(site.id, task)
  task.finally(() => {
    if (inFlight.get(site.id) === task) inFlight.delete(site.id)
  })
  return task
}
