import { createHash } from 'node:crypto'
import type { NotificationContext, SeoAlertRule, SeoState, Site } from '#shared/types'
import { claimAlert } from '../alertState'
import { getSeoState, insertNotification, upsertSeoState, type SeoStatePatch } from '../db'
import { defaultSeoFetch, fetchFollowing, type SeoFetch } from './fetch'
import { blocksRoot, combineRobots, extractHead, hasNoindex, headerRobots, parseRobots } from './parse'

// Cheap indexability guards run after every uptime check, alerting only on *transitions* — a site
// that was deliberately noindex from day one stays quiet; one that turns noindex after a deploy
// doesn't. The homepage signals come from the body the check already downloaded; robots.txt is
// fetched at most hourly.

const ROBOTS_REFRESH_MS = 60 * 60 * 1000
const ROBOTS_RETRY_MS = 5_000
const ALERT_COOLDOWN_HOURS = 24

/** The slice of an `httpCheck` result the guards read. */
export interface GuardHttpInput {
  finalUrl: string
  httpStatus: number | null
  contentType: string | null
  bodyText: string | null
  responseHeaders: Record<string, string>
  error: string | null
}

export interface GuardAlert {
  rule: SeoAlertRule
  message: string
  context: Extract<NotificationContext, { kind: 'seo' }>
}

export interface HomepageSignals {
  robots: string | null
  canonical: string | null
  title: string | null
}

function header(headers: Record<string, string>, name: string): string | null {
  const want = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === want) return v
  return null
}

/** Homepage signals from a successful HTML check, or null when the response isn't a usable page. */
export function readHomepage(http: GuardHttpInput): HomepageSignals | null {
  if (http.error || http.httpStatus === null || http.httpStatus < 200 || http.httpStatus >= 300) return null
  if (!http.bodyText || !/html/i.test(http.contentType || '')) return null
  const head = extractHead(http.bodyText, http.finalUrl)
  return {
    robots: combineRobots(head.metaRobots, headerRobots(header(http.responseHeaders, 'x-robots-tag'))),
    canonical: head.canonical,
    title: head.title,
  }
}

const robotsFailing = (status: number | null) => status === 0 || (status !== null && status >= 500)

/** Pure transition logic: what changed between the stored state and what was just observed. */
export function diffHomepage(prev: SeoState | null, cur: HomepageSignals): GuardAlert[] {
  if (!prev) return []
  const out: GuardAlert[] = []
  if (!hasNoindex(prev.homepageRobots) && hasNoindex(cur.robots)) {
    out.push({
      rule: 'noindex',
      message: `homepage is now noindex (${cur.robots}) — search engines will drop it from results`,
      context: { kind: 'seo', rule: 'noindex', from: prev.homepageRobots, to: cur.robots },
    })
  }
  if (prev.homepageCanonical && cur.canonical && prev.homepageCanonical !== cur.canonical) {
    let offsite = false
    try {
      offsite = new URL(cur.canonical).host !== new URL(prev.homepageCanonical).host
    } catch {
      // keep false
    }
    out.push({
      rule: 'canonical_changed',
      message: offsite
        ? `homepage canonical now points to another host: ${cur.canonical} (was ${prev.homepageCanonical})`
        : `homepage canonical changed from ${prev.homepageCanonical} to ${cur.canonical}`,
      context: { kind: 'seo', rule: 'canonical_changed', from: prev.homepageCanonical, to: cur.canonical },
    })
  }
  return out
}

export function diffRobots(
  prev: SeoState | null,
  cur: { status: number; blocked: boolean },
): GuardAlert[] {
  if (!prev || prev.robotsCheckedAt === null) return []
  const out: GuardAlert[] = []
  if (!prev.robotsBlocked && cur.blocked) {
    out.push({
      rule: 'robots_blocked',
      message: 'robots.txt now disallows / for Googlebot — the whole site will stop being crawled',
      context: { kind: 'seo', rule: 'robots_blocked', from: null, to: 'Disallow: /' },
    })
  }
  if (!robotsFailing(prev.robotsStatus) && robotsFailing(cur.status)) {
    const what = cur.status === 0 ? 'not responding' : `returning HTTP ${cur.status}`
    out.push({
      rule: 'robots_unreachable',
      message: `robots.txt is ${what} — Google pauses crawling while it can't read robots.txt`,
      context: { kind: 'seo', rule: 'robots_unreachable', from: String(prev.robotsStatus ?? ''), to: String(cur.status) },
    })
  }
  return out
}

function emit(site: Site, alerts: GuardAlert[]) {
  const label = site.name || site.url
  for (const a of alerts) {
    if (!claimAlert(site.id, 'seo_regression', `${a.rule}:${a.context.to ?? ''}`, ALERT_COOLDOWN_HOURS)) continue
    insertNotification({ siteId: site.id, type: 'seo_regression', message: `${label} ${a.message}`, context: a.context })
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchRobots(origin: string, fetchFn: SeoFetch, retryMs: number) {
  const url = new URL('/robots.txt', origin).toString()
  let res = await fetchFollowing(url, fetchFn)
  // One retry before believing a failure: a single blip shouldn't page anyone.
  if (robotsFailing(res.status)) {
    await sleep(retryMs)
    res = await fetchFollowing(url, fetchFn)
  }
  const text = res.status >= 200 && res.status < 300 && res.body ? res.body.toString('utf-8') : null
  return {
    status: res.status,
    blocked: text !== null && blocksRoot(parseRobots(text)),
    hash: text !== null ? createHash('sha1').update(text).digest('hex') : null,
  }
}

/**
 * Run after a check (outside maintenance). Never throws to the caller's detriment — callers fire
 * it and forget, so a slow robots.txt doesn't hold up the check loop.
 */
export async function evaluateSeoGuards(
  site: Site,
  http: GuardHttpInput,
  deps: { fetch?: SeoFetch; now?: number; retryMs?: number } = {},
): Promise<void> {
  if (!site.seoEnabled) return
  const homepage = readHomepage(http)
  // Only judge SEO off a healthy HTML page: a down site or a JSON health endpoint says nothing
  // about indexability, and robots.txt failing while the whole site is down is the down alert's job.
  if (!homepage) return

  const prev = getSeoState(site.id)
  const alerts = diffHomepage(prev, homepage)
  const patch: SeoStatePatch = {
    homepageRobots: homepage.robots,
    homepageCanonical: homepage.canonical,
    homepageTitle: homepage.title,
  }

  const now = deps.now ?? Date.now()
  const lastRobots = prev?.robotsCheckedAt ? Date.parse(`${prev.robotsCheckedAt.replace(' ', 'T')}Z`) : 0
  if (now - lastRobots >= ROBOTS_REFRESH_MS) {
    const robots = await fetchRobots(http.finalUrl, deps.fetch ?? defaultSeoFetch, deps.retryMs ?? ROBOTS_RETRY_MS)
    alerts.push(...diffRobots(prev, robots))
    Object.assign(patch, {
      robotsStatus: robots.status,
      robotsBlocked: robots.blocked,
      robotsHash: robots.hash,
      robotsCheckedAt: new Date(now).toISOString().slice(0, 19).replace('T', ' '),
    } satisfies SeoStatePatch)
  }

  upsertSeoState(site.id, patch)
  emit(site, alerts)
}
