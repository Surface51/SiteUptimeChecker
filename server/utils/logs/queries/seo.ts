import { rangeParams, sanitizeLogRows, serverIdsClause, type LogScope } from '../apiHelpers'
import { queryLogs } from '../logDb'

// Search-engine crawlers, classified by user agent. `bot_name` holds the crawler-user-agents
// *description*, which isn't a stable name to group by, so match the UA tokens directly. These
// are claimed identities — nothing here verifies the requester via reverse DNS.
const ENGINE_CASE = `CASE
    WHEN user_agent ILIKE '%googlebot%' OR user_agent ILIKE '%google-inspectiontool%' THEN 'Google'
    WHEN user_agent ILIKE '%bingbot%' THEN 'Bing'
    WHEN user_agent ILIKE '%yandexbot%' THEN 'Yandex'
    WHEN user_agent ILIKE '%duckduckbot%' THEN 'DuckDuckGo'
    WHEN user_agent ILIKE '%baiduspider%' THEN 'Baidu'
    WHEN user_agent ILIKE '%applebot%' THEN 'Apple'
  END`

// Rows considered for the sitemap-coverage share; enough for any realistic site's crawled paths.
const COVERAGE_PATH_LIMIT = 5000

export async function crawlerStats(scope: LogScope, sitemapPaths: Set<string> | null) {
  const clause = serverIdsClause(scope.serverIds)
  const params = rangeParams(scope)
  const base = `FROM access_log
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to AND is_bot AND (${ENGINE_CASE}) IS NOT NULL`

  const [dailyRows, statusRows, errorRows, pathRows] = await Promise.all([
    queryLogs(
      `SELECT time_bucket(INTERVAL '1 day', ts) AS bucket, ${ENGINE_CASE} AS engine, count(*) AS value
       ${base}
       GROUP BY 1, 2
       ORDER BY 1`,
      params,
    ),
    queryLogs(
      `SELECT ${ENGINE_CASE} AS engine,
         count(*) AS total,
         sum(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS s2xx,
         sum(CASE WHEN status BETWEEN 300 AND 399 THEN 1 ELSE 0 END) AS s3xx,
         sum(CASE WHEN status BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS s4xx,
         sum(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS s5xx
       ${base}
       GROUP BY 1
       ORDER BY total DESC`,
      params,
    ),
    queryLogs(
      `SELECT path, status, count(*) AS hits, max(ts) AS last_seen
       ${base} AND status >= 400
       GROUP BY 1, 2
       ORDER BY hits DESC
       LIMIT 25`,
      params,
    ),
    sitemapPaths
      ? queryLogs(
          `SELECT path, count(*) AS hits
           ${base} AND status BETWEEN 200 AND 299
           GROUP BY 1
           ORDER BY hits DESC
           LIMIT ${COVERAGE_PATH_LIMIT}`,
          params,
        )
      : Promise.resolve([]),
  ])

  let coverage: { hits: number; inSitemapHits: number; outsideSitemapPct: number | null } | null = null
  if (sitemapPaths && sitemapPaths.size) {
    let hits = 0
    let inSitemapHits = 0
    for (const r of sanitizeLogRows(pathRows)) {
      const n = Number(r.hits) || 0
      hits += n
      if (sitemapPaths.has(String(r.path))) inSitemapHits += n
    }
    coverage = { hits, inSitemapHits, outsideSitemapPct: hits ? ((hits - inSitemapHits) / hits) * 100 : null }
  }

  return {
    daily: sanitizeLogRows(dailyRows),
    byEngine: sanitizeLogRows(statusRows),
    topErrors: sanitizeLogRows(errorRows),
    coverage,
  }
}
