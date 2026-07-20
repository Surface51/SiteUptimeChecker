import type { Site } from '#shared/types'
import { runCheck } from './checks'
import { getLatestCheck, getSite, listSites } from './db'
import { captureScreenshot, shouldRefreshScreenshot } from './screenshot'

const timers = new Map<number, NodeJS.Timeout>()
const running = new Set<number>()

function jitter(ms: number): number {
  const spread = ms * 0.1
  return ms + (Math.random() * 2 - 1) * spread
}

function msSinceLastCheck(siteId: number): number | null {
  const latest = getLatestCheck(siteId)
  if (!latest) return null
  // SQLite datetime('now') stores UTC as "YYYY-MM-DD HH:MM:SS" — treat as UTC.
  const checkedAt = new Date(`${latest.checkedAt.replace(' ', 'T')}Z`)
  return Date.now() - checkedAt.getTime()
}

export function scheduleSite(site: Site, delayMsOverride?: number) {
  unscheduleSite(site.id)
  if (!site.enabled) return

  const intervalMs = site.checkIntervalSeconds * 1000
  let delay = delayMsOverride
  if (delay === undefined) {
    const elapsed = msSinceLastCheck(site.id)
    delay = elapsed === null ? 0 : Math.max(0, intervalMs - elapsed)
  }

  const timer = setTimeout(() => {
    void tick(site.id)
  }, jitter(Math.max(delay, 0)))
  timers.set(site.id, timer)
}

export function unscheduleSite(siteId: number) {
  const timer = timers.get(siteId)
  if (timer) {
    clearTimeout(timer)
    timers.delete(siteId)
  }
}

async function tick(siteId: number) {
  if (running.has(siteId)) return
  running.add(siteId)

  try {
    const site = getSite(siteId)
    if (!site || !site.enabled) return
    try {
      const check = await runCheck(site)
      if (check.status !== 'down' && shouldRefreshScreenshot(site)) {
        captureScreenshot(site.id, site.url)
      }
    } catch (err) {
      console.error(`[scheduler] check failed for site ${siteId}:`, err)
    }
  } finally {
    running.delete(siteId)
    const site = getSite(siteId)
    if (site && site.enabled) {
      scheduleSite(site, site.checkIntervalSeconds * 1000)
    }
  }
}

export function startScheduler() {
  for (const site of listSites()) {
    scheduleSite(site)
  }
}

export function stopScheduler() {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
}
