import { closeDb, getDb } from '../utils/db'
import { startDomainInfoScheduler, stopDomainInfoScheduler } from '../utils/domainInfo'
import { startLighthouseScheduler, stopLighthouseScheduler } from '../utils/lighthouse'
import { closeBrowser } from '../utils/screenshot'
import { startScheduler, stopScheduler } from '../utils/scheduler'

export default defineNitroPlugin((nitroApp) => {
  getDb()

  // In `nuxt dev`, Nitro restarts on every server-side file change, which would otherwise
  // re-trigger uptime checks, Lighthouse audits, and WHOIS/DNS lookups for every site on every
  // save. Keep dev reads-only against the existing DB; only run the real schedulers in
  // production (`nuxt build` + start).
  if (!import.meta.dev) {
    startScheduler()
    startLighthouseScheduler()
    startDomainInfoScheduler()
  }

  nitroApp.hooks.hook('close', async () => {
    if (!import.meta.dev) {
      stopScheduler()
      stopLighthouseScheduler()
      stopDomainInfoScheduler()
    }
    await closeBrowser()
    closeDb()
  })
})
