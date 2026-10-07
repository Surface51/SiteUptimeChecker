import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import type { Site } from '#shared/types'
import { getScreenshotsDir, touchSiteScreenshot } from './db'
import { MONITOR_HEADERS } from './checks/httpCheck'

const VIEWPORT = { width: 1280, height: 800 }
const NAV_TIMEOUT_MS = 20_000
// Cloudflare's "Just a moment…" check can take a while even for allow-listed traffic; the
// capture queue is serial, so this is also the most one stuck site can hold everything up.
const CHALLENGE_TIMEOUT_MS = 45_000
export const SCREENSHOT_REFRESH_MS = 6 * 60 * 60 * 1000

let browserPromise: Promise<Browser> | null = null
let captureQueue: Promise<void> = Promise.resolve()
let warnedMissingBrowser = false

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((err) => {
      browserPromise = null
      throw err
    })
  }
  return browserPromise
}

export async function closeBrowser() {
  if (!browserPromise) return
  const browser = await browserPromise.catch(() => null)
  if (browser) await browser.close()
  browserPromise = null
}

/** Like {@link captureScreenshot} but awaitable and failing loudly, for an explicit retake. */
export function retakeScreenshot(siteId: number, url: string): Promise<void> {
  const task = captureQueue.then(() => doCapture(siteId, url))
  captureQueue = task.catch(() => {})
  return task
}

export function captureScreenshot(siteId: number, url: string): Promise<void> {
  const task = captureQueue.then(() => doCapture(siteId, url)).catch((err) => {
    if (!warnedMissingBrowser) {
      warnedMissingBrowser = true
      console.error(
        `[screenshot] capture failed for site ${siteId} (further failures will be logged quietly): ${err?.message || err}`,
      )
    }
  })
  captureQueue = task
  return task
}

/** Page-context expression: true while the page is a Cloudflare interstitial (managed
 * challenge / Turnstile / block page). A string because this tsconfig has no DOM lib. */
const IS_CHALLENGE_PAGE = `(() => {
  const title = document.title.toLowerCase()
  return (
    title.includes('just a moment') ||
    title.includes('attention required') ||
    !!document.querySelector(
      '#challenge-running, #challenge-form, #cf-challenge-running, .cf-turnstile, iframe[src*="challenges.cloudflare.com"]',
    )
  )
})()`

/** Hostname without a leading "www.", so the apex and www variants of a site count as one. */
function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

/**
 * Waits out a Cloudflare challenge. Returns false if it never cleared, in which case the page is
 * the interstitial, not the site, and must not be saved as the site's screenshot.
 */
async function waitForChallenge(page: Page): Promise<boolean> {
  if (!(await page.evaluate(IS_CHALLENGE_PAGE).catch(() => false))) return true
  try {
    // The check resolves by navigating to the real page, which tears down the execution
    // context mid-poll; waitForFunction retries across that.
    await page.waitForFunction(
      `!${IS_CHALLENGE_PAGE}`,
      undefined,
      { timeout: CHALLENGE_TIMEOUT_MS },
    )
  } catch {
    return false
  }
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT_MS }).catch(() => {})
  await page.waitForTimeout(1000)
  return true
}

async function doCapture(siteId: number, url: string) {
  const browser = await getBrowser()
  // Identify as the monitor (same UA / X-Uptime-Monitor token as the check probes) so a
  // Cloudflare or WAF allow-list written for the probes matches the screenshot browser too —
  // stock headless Chromium reads as "HeadlessChrome" and gets challenged.
  const { 'User-Agent': userAgent, ...monitorHeaders } = MONITOR_HEADERS
  const { 'Accept-Encoding': _enc, Accept: _accept, ...identityHeaders } = monitorHeaders
  const context = await browser.newContext({ viewport: VIEWPORT, userAgent })
  try {
    // Custom headers only go to the site's own host: sent to third parties they would force
    // CORS preflights that break the page's analytics, fonts, embeds and so on.
    const siteHost = bareHost(new URL(url).hostname)
    await context.route(
      (u) => bareHost(u.hostname) === siteHost,
      (route) => route.continue({ headers: { ...route.request().headers(), ...identityHeaders } }),
    )
    const page = await context.newPage()
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS })
    } catch {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }).catch(() => {})
      await page.waitForTimeout(1000)
    }
    if (!(await waitForChallenge(page))) {
      // Keep the previous good screenshot rather than replacing it with a verification page.
      throw new Error(`Cloudflare challenge did not clear within ${CHALLENGE_TIMEOUT_MS / 1000}s for ${url}`)
    }
    const path = join(getScreenshotsDir(), `${siteId}.png`)
    await page.screenshot({ path })
    touchSiteScreenshot(siteId)
  } finally {
    await context.close()
  }
}

export function shouldRefreshScreenshot(site: Site): boolean {
  if (!site.screenshotUpdatedAt) return true
  const updatedAt = new Date(`${site.screenshotUpdatedAt.replace(' ', 'T')}Z`)
  return Date.now() - updatedAt.getTime() > SCREENSHOT_REFRESH_MS
}
