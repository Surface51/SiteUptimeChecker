import { rangeParams, sanitizeLogRows, serverIdsClause, type LogScope } from '../apiHelpers'
import { queryLogs } from '../logDb'

/**
 * What the stack was doing around an uptime incident.
 *
 * This is the join the two halves of the app exist to make: the incident itself comes from
 * SQLite (a check that failed), and everything here comes from the DuckDB log store, windowed
 * to the incident. Minute buckets rather than the usual auto interval — an outage is typically
 * minutes long, and hourly buckets would flatten it into a single bar.
 */
export async function incidentContext(scope: LogScope) {
  const clause = serverIdsClause(scope.serverIds)
  const params = rangeParams(scope)

  const [requests, topPaths, phpErrors, fpmEvents, topIps] = await Promise.all([
    queryLogs(
      `SELECT time_bucket(INTERVAL '1 minute', ts) AS bucket,
              CASE WHEN status >= 500 THEN '5xx' ELSE 'other' END AS series,
              count(*) AS value
       FROM access_log
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to
       GROUP BY 1, 2
       ORDER BY 1`,
      params,
    ),
    queryLogs(
      `SELECT path_pattern, status, count(*) AS count
       FROM access_log
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to AND status >= 500
       GROUP BY path_pattern, status
       ORDER BY count DESC
       LIMIT 10`,
      params,
    ),
    queryLogs(
      `SELECT arg_max(error_type, ts) AS error_type,
              arg_max(message, ts) AS sample_message,
              count(*) AS occurrences
       FROM php_error
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to
       GROUP BY fingerprint
       ORDER BY occurrences DESC
       LIMIT 10`,
      params,
    ),
    queryLogs(
      `SELECT event_type, count(*) AS count
       FROM fpm_events
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to
         AND event_type IN ('slow_exec', 'max_children', 'child_exited')
       GROUP BY event_type
       ORDER BY count DESC`,
      params,
    ),
    queryLogs(
      `SELECT client_ip, count(*) AS requests
       FROM access_log
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to
       GROUP BY client_ip
       ORDER BY requests DESC
       LIMIT 5`,
      params,
    ),
  ])

  return {
    requests: sanitizeLogRows(requests),
    topPaths: sanitizeLogRows(topPaths),
    phpErrors: sanitizeLogRows(phpErrors),
    fpmEvents: sanitizeLogRows(fpmEvents),
    topIps: sanitizeLogRows(topIps),
  }
}
