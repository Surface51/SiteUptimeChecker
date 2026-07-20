import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import type { Site } from '#shared/types'
import { getScreenshotsDir, touchSiteScreenshot } from './db'

const VIEWPORT = { width: 1280, height: 800 }
const NAV_TIMEOUT_MS = 20_000
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

async function doCapture(siteId: number, url: string) {
  const browser = await getBrowser()
  const page = await browser.newPage({ viewport: VIEWPORT })
  try {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS })
    } catch {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }).catch(() => {})
      await page.waitForTimeout(1000)
    }
    const path = join(getScreenshotsDir(), `${siteId}.png`)
    await page.screenshot({ path })
    touchSiteScreenshot(siteId)
  } finally {
    await page.close()
  }
}

export function shouldRefreshScreenshot(site: Site): boolean {
  if (!site.screenshotUpdatedAt) return true
  const updatedAt = new Date(`${site.screenshotUpdatedAt.replace(' ', 'T')}Z`)
  return Date.now() - updatedAt.getTime() > SCREENSHOT_REFRESH_MS
}
