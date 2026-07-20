import { closeDb, getDb } from '../utils/db'
import { closeBrowser } from '../utils/screenshot'
import { startScheduler, stopScheduler } from '../utils/scheduler'

export default defineNitroPlugin((nitroApp) => {
  getDb()
  startScheduler()

  nitroApp.hooks.hook('close', async () => {
    stopScheduler()
    await closeBrowser()
    closeDb()
  })
})
