import { listSites } from '../../utils/db'
import { queryLogs } from '../../utils/logs/logDb'
import { sanitizeLogRows } from '../../utils/logs/apiHelpers'

/** Every log folder that has been ingested, annotated with the monitored site it's linked to.
 * The join is done here rather than in SQL: sites live in SQLite, log rows in DuckDB. */
export default defineEventHandler(async () => {
  const rows = await queryLogs(
    `SELECT s.name AS slug,
            count(DISTINCT sv.server_id) AS servers,
            count(DISTINCT sv.env) AS envs,
            min(sv.env) AS first_env
     FROM sites s LEFT JOIN servers sv ON sv.site_id = s.site_id
     GROUP BY s.name
     ORDER BY s.name`,
  ).catch(() => [])

  const linkedBy = new Map<string, { id: number; name: string | null; url: string }>()
  for (const site of listSites()) {
    if (site.logSlug) linkedBy.set(site.logSlug, { id: site.id, name: site.name, url: site.url })
  }

  return {
    logs: sanitizeLogRows(rows).map((row) => ({
      ...row,
      site: linkedBy.get(String(row.slug)) ?? null,
    })),
  }
})
