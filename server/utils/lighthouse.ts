import * as chromeLauncher from 'chrome-launcher'
import lighthouse, { desktopConfig } from 'lighthouse'
import { chromium } from 'playwright'
import type { LighthouseFormFactor, LighthouseJob, LighthouseReport, Site } from '#shared/types'
import { getLatestLighthouseReport, insertLighthouseReport, insertNotification, listSites } from './db'

const ONLY_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']
const REGRESSION_THRESHOLD = 10
const DAY_MS = 24 * 60 * 60 * 1000

const FORM_FACTORS: LighthouseFormFactor[] = ['mobile', 'desktop']

let lighthouseQueue: Promise<void> = Promise.resolve()
let warnedFailure = false

// Tracks non-forced runs that are queued/running, keyed by `${siteId}:${formFactor}`, so a
// second non-forced request for the same site/form-factor before the first completes reuses
// the in-flight run instead of stacking a duplicate (the day-level DB check alone can't see
// work that hasn't been persisted yet).
const inFlightRuns = new Map<string, Promise<LighthouseReport>>()

function inFlightKey(siteId: number, formFactor: LighthouseFormFactor): string {
  return `${siteId}:${formFactor}`
}

// ---------- in-memory job/progress tracking ----------
// Not persisted — this is best-effort UI feedback for the current server process, not an
// audit log. Runs are already serialized through `lighthouseQueue`, so "active" is at most
// one running job plus everything still queued behind it.

const MAX_RECENT_JOBS = 20
let jobSeq = 0
const jobs = new Map<string, LighthouseJob>()

function nowIso(): string {
  return new Date().toISOString()
}

function createJob(site: Site, formFactor: LighthouseFormFactor): LighthouseJob {
  const job: LighthouseJob = {
    id: `lh-${Date.now()}-${++jobSeq}`,
    siteId: site.id,
    siteLabel: site.name || site.url,
    formFactor,
    status: 'queued',
    phase: 'Queued',
    queuedAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    error: null,
  }
  jobs.set(job.id, job)
  return job
}

function updateJob(id: string, patch: Partial<LighthouseJob>) {
  const job = jobs.get(id)
  if (!job) return
  Object.assign(job, patch)
  if (patch.status === 'done' || patch.status === 'error') pruneFinishedJobs()
}

function pruneFinishedJobs() {
  const finished = [...jobs.values()]
    .filter((j) => j.status === 'done' || j.status === 'error')
    .sort((a, b) => (a.finishedAt ?? '').localeCompare(b.finishedAt ?? ''))
  const excess = finished.length - MAX_RECENT_JOBS
  for (let i = 0; i < excess; i++) jobs.delete(finished[i]!.id)
}

export function getLighthouseProgress(): { active: LighthouseJob[]; recent: LighthouseJob[] } {
  const all = [...jobs.values()]
  const active = all.filter((j) => j.status === 'queued' || j.status === 'running')
  const recent = all
    .filter((j) => j.status === 'done' || j.status === 'error')
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
  return { active, recent }
}

export function enqueueLighthouse(
  site: Site,
  formFactor: LighthouseFormFactor,
  opts: { force?: boolean } = {},
): Promise<LighthouseReport> {
  const key = inFlightKey(site.id, formFactor)

  if (!opts.force) {
    const pending = inFlightRuns.get(key)
    if (pending) return pending

    if (hasReportToday(site.id, formFactor)) {
      const latest = getLatestLighthouseReport(site.id, formFactor)
      if (latest) return Promise.resolve(latest)
    }
  }

  const job = createJob(site, formFactor)
  const task = lighthouseQueue.then(() => runLighthouseNow(site, formFactor, job.id))
  lighthouseQueue = task.then(
    () => undefined,
    (err) => {
      if (!warnedFailure) {
        warnedFailure = true
        console.error(
          `[lighthouse] audit failed for site ${site.id} (further failures will be logged quietly): ${err?.message || err}`,
        )
      }
    },
  )

  if (!opts.force) {
    inFlightRuns.set(key, task)
    task.finally(() => {
      if (inFlightRuns.get(key) === task) inFlightRuns.delete(key)
    })
  }

  return task
}

export async function runLighthouseNow(
  site: Site,
  formFactor: LighthouseFormFactor,
  jobId?: string,
): Promise<LighthouseReport> {
  if (jobId) updateJob(jobId, { status: 'running', startedAt: nowIso(), phase: 'Launching browser' })

  let chrome: chromeLauncher.LaunchedChrome | null = null
  try {
    chrome = await chromeLauncher.launch({
      chromePath: chromium.executablePath(),
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
    })

    if (jobId) updateJob(jobId, { phase: `Auditing ${site.url}` })

    const result = await lighthouse(
      site.url,
      { port: chrome.port, onlyCategories: ONLY_CATEGORIES, logLevel: 'silent' },
      formFactor === 'desktop' ? desktopConfig : undefined,
    )

    if (!result) {
      throw new Error('Lighthouse produced no result')
    }

    if (jobId) updateJob(jobId, { phase: 'Processing results' })

    const { lhr } = result
    const categoryScore = (id: string) => {
      const score = lhr.categories[id]?.score
      return score === null || score === undefined ? null : Math.round(score * 100)
    }
    const auditValue = (id: string) => {
      const value = lhr.audits[id]?.numericValue
      return value === null || value === undefined ? null : value
    }

    const previous = getLatestLighthouseReport(site.id, formFactor)

    const report = insertLighthouseReport({
      siteId: site.id,
      formFactor,
      performance: categoryScore('performance'),
      accessibility: categoryScore('accessibility'),
      bestPractices: categoryScore('best-practices'),
      seo: categoryScore('seo'),
      fcp: auditValue('first-contentful-paint'),
      lcp: auditValue('largest-contentful-paint'),
      tbt: auditValue('total-blocking-time'),
      cls: auditValue('cumulative-layout-shift'),
      speedIndex: auditValue('speed-index'),
      tti: auditValue('interactive'),
      lighthouseVersion: lhr.lighthouseVersion,
      error: null,
    })

    checkRegression(site, formFactor, previous, report)

    if (jobId) updateJob(jobId, { status: 'done', phase: 'Done', finishedAt: nowIso() })

    return report
  } catch (err: any) {
    const message = err?.message || String(err)
    if (jobId) updateJob(jobId, { status: 'error', phase: 'Failed', finishedAt: nowIso(), error: message })
    return insertLighthouseReport({
      siteId: site.id,
      formFactor,
      performance: null,
      accessibility: null,
      bestPractices: null,
      seo: null,
      fcp: null,
      lcp: null,
      tbt: null,
      cls: null,
      speedIndex: null,
      tti: null,
      lighthouseVersion: null,
      error: message,
    })
  } finally {
    chrome?.kill()
  }
}

function checkRegression(
  site: Site,
  formFactor: LighthouseFormFactor,
  previous: LighthouseReport | null,
  current: LighthouseReport,
) {
  if (current.performance === null || !previous || previous.performance === null) return

  const drop = previous.performance - current.performance
  if (drop >= REGRESSION_THRESHOLD) {
    const label = site.name || site.url
    insertNotification({
      siteId: site.id,
      type: 'lighthouse_regression',
      message: `${label} Performance (${formFactor}) dropped from ${previous.performance} to ${current.performance}`,
    })
  }
}

/**
 * Enqueues both form factors for every enabled site, skipping any site/form-factor that
 * already has a report within the last 24h (unless `force`). Returns how many jobs were
 * actually queued (skipped ones don't count).
 */
export function enqueueLighthouseForAllSites(opts: { force?: boolean } = {}): number {
  let queued = 0
  for (const site of listSites()) {
    if (!site.enabled) continue
    for (const formFactor of FORM_FACTORS) {
      if (!opts.force && hasReportToday(site.id, formFactor)) continue
      enqueueLighthouse(site, formFactor, opts)
      queued++
    }
  }
  return queued
}

function hasReportToday(siteId: number, formFactor: LighthouseFormFactor): boolean {
  const latest = getLatestLighthouseReport(siteId, formFactor)
  if (!latest) return false
  const measuredAt = new Date(`${latest.measuredAt.replace(' ', 'T')}Z`)
  return Date.now() - measuredAt.getTime() < DAY_MS
}

let midnightTimer: NodeJS.Timeout | null = null
let dailyTimer: NodeJS.Timeout | null = null

function enqueueAllSites() {
  for (const site of listSites()) {
    if (!site.enabled) continue
    for (const formFactor of FORM_FACTORS) enqueueLighthouse(site, formFactor)
  }
}

function msUntilNextMidnight(): number {
  const now = new Date()
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return next.getTime() - now.getTime()
}

/**
 * Runs the full audit sweep once at the next local midnight, then every 24h after that — not
 * immediately on startup. Auditing every site launches a real Chrome instance per site/form
 * factor, so running it on every process start (e.g. every deploy) would otherwise pile
 * unpredictable load onto the machine during the day; midnight keeps it off-hours.
 */
export function startLighthouseScheduler() {
  midnightTimer = setTimeout(() => {
    enqueueAllSites()
    dailyTimer = setInterval(enqueueAllSites, DAY_MS)
  }, msUntilNextMidnight())
}

export function stopLighthouseScheduler() {
  if (midnightTimer) {
    clearTimeout(midnightTimer)
    midnightTimer = null
  }
  if (dailyTimer) {
    clearInterval(dailyTimer)
    dailyTimer = null
  }
}
