import {
  pickAutoInterval,
  rangeParams,
  sanitizeLogRows,
  serverIdsClause,
  type LogScope,
} from '../apiHelpers'
import { queryLogs } from '../logDb'

/** One aligned timeline overlaying signals that live across different log files and servers —
 * the cross-log correlation a single-source tool can't produce. Overlaid with this app's own
 * uptime incidents in the UI, so an outage can be read against what the stack was doing. */
export async function correlationTimeline(scope: LogScope) {
  const clause = serverIdsClause(scope.serverIds)
  const interval = pickAutoInterval(scope.from.getTime(), scope.to.getTime())

  const rows = await queryLogs(
    `SELECT time_bucket(INTERVAL '${interval}', ts) AS bucket, '5xx' AS series, count(*) AS value
     FROM access_log
     WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to AND status >= 500
     GROUP BY 1

     UNION ALL

     SELECT time_bucket(INTERVAL '${interval}', bucket) AS bucket, 'worker_alerts' AS series, sum(count) AS value
     FROM nginx_error_agg
     WHERE server_id IN ${clause} AND bucket BETWEEN $from AND $to
       AND fingerprint ILIKE '%worker_connections%'
     GROUP BY 1

     UNION ALL

     SELECT time_bucket(INTERVAL '${interval}', ts) AS bucket, 'php_errors' AS series, count(*) AS value
     FROM php_error
     WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to
     GROUP BY 1

     UNION ALL

     SELECT time_bucket(INTERVAL '${interval}', ts) AS bucket, 'slow_queries' AS series, count(*) AS value
     FROM mysql_slow
     WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to
     GROUP BY 1

     UNION ALL

     SELECT time_bucket(INTERVAL '${interval}', ts) AS bucket, 'fpm_slow_exec' AS series, count(*) AS value
     FROM fpm_events
     WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to AND event_type = 'slow_exec'
     GROUP BY 1

     ORDER BY 1`,
    rangeParams(scope),
  )

  return { interval, series: sanitizeLogRows(rows) }
}
