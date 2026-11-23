import type { SeoIssueGroup, SeoOverview, Site } from '#shared/types'
import { getLatestSeoCrawl, getSeoState, listSeoCrawls, listSeoIssues } from '../db'
import { getSeoCrawlJob } from './scheduler'

const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 } as const

/** Everything the SEO tab renders in one call. */
export function buildSeoOverview(site: Site): SeoOverview {
  const latestCrawl = getLatestSeoCrawl(site.id)
  const groups = new Map<string, SeoIssueGroup>()
  if (latestCrawl) {
    for (const issue of listSeoIssues(latestCrawl.id)) {
      const key = `${issue.severity}:${issue.code}`
      const g = groups.get(key) ?? { code: issue.code, severity: issue.severity, count: 0, issues: [] }
      g.count++
      g.issues.push(issue)
      groups.set(key, g)
    }
  }
  const sorted = [...groups.values()].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count || a.code.localeCompare(b.code),
  )
  const trend = listSeoCrawls(site.id)
    .filter((c) => !c.error)
    .reverse()
    .map((c) => ({
      crawlId: c.id,
      startedAt: c.startedAt,
      error: c.issueCounts.error ?? 0,
      warn: c.issueCounts.warn ?? 0,
      info: c.issueCounts.info ?? 0,
    }))
  return {
    enabled: site.seoEnabled,
    state: getSeoState(site.id),
    latestCrawl,
    groups: sorted,
    trend,
    job: getSeoCrawlJob(site.id),
  }
}
