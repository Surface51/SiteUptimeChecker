import {
  pickAutoInterval,
  rangeParams,
  sanitizeLogRow,
  sanitizeLogRows,
  serverIdsClause,
  type LogScope,
} from '../apiHelpers'
import { queryLogs } from '../logDb'

export async function botsOverview(scope: LogScope) {
  const clause = serverIdsClause(scope.serverIds)
  const params = rangeParams(scope)

  const [summaryRows, topBotsRows] = await Promise.all([
    queryLogs(
      `SELECT
         sum(CASE WHEN is_bot THEN 1 ELSE 0 END) AS bot_requests,
         sum(CASE WHEN NOT is_bot THEN 1 ELSE 0 END) AS human_requests,
         coalesce(sum(CASE WHEN is_bot THEN duration ELSE 0 END), 0) AS bot_time_seconds,
         coalesce(sum(CASE WHEN is_bot THEN bytes ELSE 0 END), 0) AS bot_bytes
       FROM access_log
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to`,
      params,
    ),
    queryLogs(
      `SELECT
         coalesce(bot_name, 'Unclassified bot') AS bot_name,
         count(*) AS requests,
         coalesce(sum(duration), 0) AS time_seconds,
         approx_count_distinct(client_ip) AS unique_ips
       FROM access_log
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to AND is_bot
       GROUP BY 1
       ORDER BY requests DESC
       LIMIT 25`,
      params,
    ),
  ])

  return { summary: sanitizeLogRow(summaryRows[0] || {}), topBots: sanitizeLogRows(topBotsRows) }
}

export async function botsTimeseries(scope: LogScope) {
  const interval = pickAutoInterval(scope.from.getTime(), scope.to.getTime())

  const rows = await queryLogs(
    `SELECT
       time_bucket(INTERVAL '${interval}', ts) AS bucket,
       CASE WHEN is_bot THEN 'bot' ELSE 'human' END AS series,
       count(*) AS value
     FROM access_log
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
     GROUP BY 1, 2
     ORDER BY 1`,
    rangeParams(scope),
  )

  return { interval, series: sanitizeLogRows(rows) }
}

/** Reads the ip_profiles materialized table, which is full-history rather than time-scoped —
 * a facet crawler is identified by its behaviour across all time, not within a window. Rebuilt
 * on demand via the ip-profiles/rebuild endpoint. */
export async function facetCrawlers(scope: LogScope) {
  const rows = await queryLogs(
    `SELECT client_ip, request_count, error_4xx_count, error_5xx_count, distinct_paths,
            max_req_per_min, is_bot, bot_name, country, facet_crawl_score, computed_at
     FROM ip_profiles
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND facet_crawl_score >= 10
     ORDER BY facet_crawl_score DESC
     LIMIT 50`,
  )
  return sanitizeLogRows(rows)
}
