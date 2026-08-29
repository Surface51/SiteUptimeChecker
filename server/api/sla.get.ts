import type { SlaReport } from '#shared/types'
import { getSlaReport, listSites } from '../utils/db'

const MONTH_RE = /^\d{4}-\d{2}$/

/** Fleet SLA — one row per site that has a target set. Feeds the triage page's budget rows. */
export default defineEventHandler((event) => {
  const monthRaw = getQuery(event).month
  const month = typeof monthRaw === 'string' && MONTH_RE.test(monthRaw) ? monthRaw : undefined

  const out: { siteId: number; siteName: string; report: SlaReport }[] = []
  for (const site of listSites()) {
    const report = getSlaReport(site.id, month)
    if (report) out.push({ siteId: site.id, siteName: site.name || site.url, report })
  }
  return out
})
