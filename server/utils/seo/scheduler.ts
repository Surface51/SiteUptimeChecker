import type { SeoCrawl, SeoCrawlJob, SeoIssue, Site } from '#shared/types'
import { claimAlert } from '../alertState'
import {
  finishSeoCrawl,
  getLatestSeoCrawl,
  insertNotification,
  insertSeoCrawl,
  listSeoIssues,
  listSites,
} from '../db'
import { crawlSite, type CrawlOptions } from './crawler'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
// Boot already kicks off checks, Lighthouse and WHOIS/DNS — give those a head start.
const STARTUP_DELAY_MS = 5 * 60 * 1000

function enabled(): boolean {
  const raw = process.env.UPTIME_SEO_CRAWL?.trim()
  return !raw || (raw !== '0' && raw.toLowerCase() !== 'false')
}

// ---------- serial queue + in-memory progress (best-effort UI feedback, like lighthouse.ts) ----------

let queue: Promise<void> = Promise.resolve()
const jobs = new Map<number, SeoCrawlJob>()

export function getSeoCrawlJob(siteId: number): SeoCrawlJob | null {
  return jobs.get(siteId) ?? null
}

function isActive(job: SeoCrawlJob | undefined): boolean {
  return !!job && (job.status === 'queued' || job.status === 'running')
}

function crawledWithinWeek(siteId: number): boolean {
  const latest = getLatestSeoCrawl(siteId)
  if (!latest?.finishedAt) return false
  return Date.now() - Date.parse(`${latest.finishedAt.replace(' ', 'T')}Z`) < WEEK_MS
}

/**
 * Queue a crawl. One crawl runs at a time across all sites. A site already queued/running is not
 * queued twice; without `force`, a site crawled in the last week is skipped.
 */
export function enqueueSeoCrawl(site: Site, opts: { force?: boolean; crawl?: CrawlOptions } = {}): SeoCrawlJob | null {
  const existing = jobs.get(site.id)
  if (isActive(existing)) return existing!
  if (!opts.force && crawledWithinWeek(site.id)) return null

  const job: SeoCrawlJob = {
    siteId: site.id,
    status: 'queued',
    pagesCrawled: 0,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error: null,
  }
  jobs.set(site.id, job)
  queue = queue.then(() => runCrawl(site, job, opts.crawl)).catch((err) => {
    console.error(`[seo] crawl failed for site ${site.id}:`, err)
  })
  return job
}

async function runCrawl(site: Site, job: SeoCrawlJob, crawlOpts: CrawlOptions = {}) {
  job.status = 'running'
  job.startedAt = new Date().toISOString()
  const previous = getLatestSeoCrawl(site.id)
  const crawl = insertSeoCrawl(site.id)
  try {
    const result = await crawlSite(site.url, {
      ...crawlOpts,
      onProgress: (n) => {
        job.pagesCrawled = n
        crawlOpts.onProgress?.(n)
      },
    })
    const finished = finishSeoCrawl(crawl.id, result)
    if (previous) notifyCrawlRegression(site, previous, finished, result.issues)
    job.status = 'done'
  } catch (err) {
    const message = (err as Error)?.message || 'Crawl failed'
    finishSeoCrawl(crawl.id, { pages: [], issues: [], sitemapUrls: 0, error: message })
    job.status = 'error'
    job.error = message
  } finally {
    job.finishedAt = new Date().toISOString()
  }
}

/** Error-severity issue codes whose count rose since the previous crawl. */
export function newErrorCodes(previous: SeoIssue[], current: SeoIssue[]): string[] {
  const tally = (list: SeoIssue[]) => {
    const m = new Map<string, number>()
    for (const i of list) if (i.severity === 'error') m.set(i.code, (m.get(i.code) ?? 0) + 1)
    return m
  }
  const before = tally(previous)
  const after = tally(current)
  return [...after.entries()].filter(([code, n]) => n > (before.get(code) ?? 0)).map(([code]) => code).sort()
}

function notifyCrawlRegression(site: Site, previous: SeoCrawl, current: SeoCrawl, issues: SeoIssue[]) {
  if (current.error || previous.error) return
  const codes = newErrorCodes(listSeoIssues(previous.id), issues)
  if (!codes.length) return
  if (!claimAlert(site.id, 'seo_regression', `crawl:${current.id}`, 1)) return
  const prevErrors = previous.issueCounts.error ?? 0
  const curErrors = current.issueCounts.error ?? 0
  insertNotification({
    siteId: site.id,
    type: 'seo_regression',
    message: `${site.name || site.url} SEO crawl found new errors (${codes.join(', ')}) — ${prevErrors} → ${curErrors} errors`,
    context: { kind: 'seo', rule: 'crawl_errors', from: String(prevErrors), to: String(curErrors), crawlId: current.id, codes },
  })
}

// ---------- daily tick (work only happens weekly per site — see crawledWithinWeek) ----------

let startupTimer: NodeJS.Timeout | null = null
let dailyTimer: NodeJS.Timeout | null = null

function enqueueDue() {
  for (const site of listSites()) {
    if (site.enabled && site.seoEnabled) enqueueSeoCrawl(site)
  }
}

export function startSeoScheduler() {
  if (!enabled()) return
  startupTimer = setTimeout(enqueueDue, STARTUP_DELAY_MS)
  dailyTimer = setInterval(enqueueDue, DAY_MS)
}

export function stopSeoScheduler() {
  if (startupTimer) clearTimeout(startupTimer)
  if (dailyTimer) clearInterval(dailyTimer)
  startupTimer = null
  dailyTimer = null
}
