import { closeDb, getDb } from '../utils/db'
import { startLighthouseScheduler, stopLighthouseScheduler } from '../utils/lighthouse'
import { closeBrowser } from '../utils/screenshot'
import { startScheduler, stopScheduler } from '../utils/scheduler'

export default defineNitroPlugin((nitroApp) => {
  getDb()
  startScheduler()
  startLighthouseScheduler()

  nitroApp.hooks.hook('close', async () => {
    stopScheduler()
    stopLighthouseScheduler()
    await closeBrowser()
    closeDb()
  })
})
