import * as chromeLauncher from 'chrome-launcher'
import lighthouse, { desktopConfig } from 'lighthouse'
import { chromium } from 'playwright'
import type { LighthouseFormFactor, LighthouseReport, Site } from '#shared/types'
import { getLatestLighthouseReport, insertLighthouseReport, insertNotification, listSites } from './db'

const ONLY_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']
const REGRESSION_THRESHOLD = 10
const DAY_MS = 24 * 60 * 60 * 1000

const FORM_FACTORS: LighthouseFormFactor[] = ['mobile', 'desktop']

let lighthouseQueue: Promise<void> = Promise.resolve()
let warnedFailure = false

export function enqueueLighthouse(site: Site, formFactor: LighthouseFormFactor): Promise<LighthouseReport> {
  const task = lighthouseQueue.then(() => runLighthouseNow(site, formFactor))
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
  return task
}

export async function runLighthouseNow(site: Site, formFactor: LighthouseFormFactor): Promise<LighthouseReport> {
  let chrome: chromeLauncher.LaunchedChrome | null = null
  try {
    chrome = await chromeLauncher.launch({
      chromePath: chromium.executablePath(),
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
    })

    const result = await lighthouse(
      site.url,
      { port: chrome.port, onlyCategories: ONLY_CATEGORIES, logLevel: 'silent' },
      formFactor === 'desktop' ? desktopConfig : undefined,
    )

    if (!result) {
      throw new Error('Lighthouse produced no result')
    }

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

    return report
  } catch (err: any) {
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
      error: err?.message || String(err),
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

function hasReportToday(siteId: number, formFactor: LighthouseFormFactor): boolean {
  const latest = getLatestLighthouseReport(siteId, formFactor)
  if (!latest) return false
  const measuredAt = new Date(`${latest.measuredAt.replace(' ', 'T')}Z`)
  return Date.now() - measuredAt.getTime() < DAY_MS
}

let dailyTimer: NodeJS.Timeout | null = null

export function startLighthouseScheduler() {
  for (const site of listSites()) {
    if (!site.enabled) continue
    for (const formFactor of FORM_FACTORS) {
      if (!hasReportToday(site.id, formFactor)) enqueueLighthouse(site, formFactor)
    }
  }

  dailyTimer = setInterval(() => {
    for (const site of listSites()) {
      if (!site.enabled) continue
      for (const formFactor of FORM_FACTORS) enqueueLighthouse(site, formFactor)
    }
  }, DAY_MS)
}

export function stopLighthouseScheduler() {
  if (dailyTimer) {
    clearInterval(dailyTimer)
    dailyTimer = null
  }
}
