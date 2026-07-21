import { runCheck } from '../../utils/checks'
import { listSites } from '../../utils/db'
import { scheduleSite } from '../../utils/scheduler'
import { captureScreenshot } from '../../utils/screenshot'

export default defineEventHandler(async () => {
  const sites = listSites().filter((s) => s.enabled)

  const results = await Promise.allSettled(
    sites.map(async (site) => {
      const result = await runCheck(site)
      if (result.status !== 'down') {
        captureScreenshot(site.id, site.url)
      }
      scheduleSite(site, site.checkIntervalSeconds * 1000)
      return result
    }),
  )

  const checked = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.length - checked
  return { checked, failed }
})
