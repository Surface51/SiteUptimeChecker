// PHP-FPM, PHP slow-log, and MySQL slow-query views — the "what is the stack underneath the web
// server doing" half of the analytics, as opposed to the request-level views in traffic.ts.
import {
  pickAutoInterval,
  rangeParams,
  sanitizeLogRow,
  sanitizeLogRows,
  serverIdsClause,
  type LogScope,
} from '../apiHelpers'
import { queryLogs } from '../logDb'

export async function fpmOverview(scope: LogScope) {
  const clause = serverIdsClause(scope.serverIds)
  const params = rangeParams(scope)

  const [statsRows, topSlowRows] = await Promise.all([
    queryLogs(
      `SELECT
         sum(CASE WHEN event_type = 'child_exited' THEN 1 ELSE 0 END) AS child_exits,
         sum(CASE WHEN event_type = 'child_started' THEN 1 ELSE 0 END) AS child_starts,
         sum(CASE WHEN event_type = 'slow_exec' THEN 1 ELSE 0 END) AS slow_exec_count,
         sum(CASE WHEN event_type = 'max_children' THEN 1 ELSE 0 END) AS max_children_count,
         avg(CASE WHEN event_type = 'child_exited' THEN lifetime_sec END) AS avg_child_lifetime,
         avg(CASE WHEN event_type = 'slow_exec' THEN slow_sec END) AS avg_slow_sec
       FROM fpm_events
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to`,
      params,
    ),
    queryLogs(
      `SELECT ts, pool, request_url, slow_sec
       FROM fpm_events
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to AND event_type = 'slow_exec'
       ORDER BY slow_sec DESC
       LIMIT 20`,
      params,
    ),
  ])

  return { overview: sanitizeLogRow(statsRows[0] || {}), topSlowRequests: sanitizeLogRows(topSlowRows) }
}

export async function fpmTimeseries(scope: LogScope) {
  const interval = pickAutoInterval(scope.from.getTime(), scope.to.getTime())

  const rows = await queryLogs(
    `SELECT
       time_bucket(INTERVAL '${interval}', ts) AS bucket,
       event_type AS series,
       count(*) AS value
     FROM fpm_events
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
       AND event_type IN ('child_exited', 'slow_exec', 'max_children')
     GROUP BY 1, 2
     ORDER BY 1`,
    rangeParams(scope),
  )

  return { interval, series: sanitizeLogRows(rows) }
}

export async function phpSlowGroups(scope: LogScope) {
  const rows = await queryLogs(
    `SELECT
       fingerprint,
       arg_max(script, ts) AS script,
       arg_max(stack, ts) AS sample_stack,
       count(*) AS occurrences,
       min(ts) AS first_seen,
       max(ts) AS last_seen
     FROM php_slow
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
     GROUP BY fingerprint
     ORDER BY occurrences DESC
     LIMIT 100`,
    rangeParams(scope),
  )
  return sanitizeLogRows(rows)
}

/** pt-query-digest style: slow queries grouped by normalized-SQL fingerprint, worst total time
 * first — total time being what actually costs the database, not the single slowest outlier. */
export async function mysqlDigest(scope: LogScope) {
  const rows = await queryLogs(
    `SELECT
       fingerprint_hash,
       arg_max(fingerprint, ts) AS fingerprint,
       count(*) AS count,
       sum(query_time) AS total_time,
       avg(query_time) AS avg_time,
       max(query_time) AS max_time,
       avg(rows_examined) AS avg_rows_examined,
       sum(CASE WHEN qc_hit THEN 1 ELSE 0 END) AS qc_hits
     FROM mysql_slow
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
     GROUP BY fingerprint_hash
     ORDER BY total_time DESC
     LIMIT 100`,
    rangeParams(scope),
  )
  return sanitizeLogRows(rows)
}

export async function mysqlDigestSamples(scope: LogScope, hash: string) {
  const rows = await queryLogs(
    `SELECT ts, db_user, db_host, db_schema, query_time, lock_time, rows_sent, rows_examined, sql_text
     FROM mysql_slow
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
       AND fingerprint_hash = $hash
     ORDER BY query_time DESC
     LIMIT 20`,
    { ...rangeParams(scope), hash },
  )
  return sanitizeLogRows(rows)
}
