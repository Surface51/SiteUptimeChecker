import { closeDb, getDb } from '../utils/db'
import { startDomainInfoScheduler, stopDomainInfoScheduler } from '../utils/domainInfo'
import { startLighthouseScheduler, stopLighthouseScheduler } from '../utils/lighthouse'
import { closeBrowser } from '../utils/screenshot'
import { startScheduler, stopScheduler } from '../utils/scheduler'

export default defineNitroPlugin((nitroApp) => {
  getDb()
  startScheduler()
  startLighthouseScheduler()
  startDomainInfoScheduler()

  nitroApp.hooks.hook('close', async () => {
    stopScheduler()
    stopLighthouseScheduler()
    stopDomainInfoScheduler()
    await closeBrowser()
    closeDb()
  })
})
