import {
  pickAutoInterval,
  rangeParams,
  sanitizeLogRows,
  serverIdsClause,
  type LogScope,
} from '../apiHelpers'
import { queryLogs } from '../logDb'

export async function httpErrorTimeseries(scope: LogScope) {
  const interval = pickAutoInterval(scope.from.getTime(), scope.to.getTime())

  const rows = await queryLogs(
    `SELECT
       time_bucket(INTERVAL '${interval}', ts) AS bucket,
       CASE WHEN status < 500 THEN '4xx' ELSE '5xx' END AS series,
       count(*) AS value
     FROM access_log
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
       AND status >= 400
     GROUP BY 1, 2
     ORDER BY 1`,
    rangeParams(scope),
  )

  return { interval, series: sanitizeLogRows(rows) }
}

export async function httpErrorTop(scope: LogScope, statusClass: string | null) {
  // Whitelisted rather than interpolated from the raw parameter.
  const statusFilter =
    statusClass === '4xx'
      ? 'status >= 400 AND status < 500'
      : statusClass === '5xx'
        ? 'status >= 500'
        : 'status >= 400'

  const rows = await queryLogs(
    `SELECT path_pattern, status, count(*) AS count
     FROM access_log
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
       AND ${statusFilter}
     GROUP BY path_pattern, status
     ORDER BY count DESC
     LIMIT 50`,
    rangeParams(scope),
  )
  return sanitizeLogRows(rows)
}

/** nginx errors arrive pre-aggregated into per-minute buckets by the parser (a single alert can
 * repeat millions of times), so this re-aggregates buckets rather than counting rows. */
export async function nginxErrorGroups(scope: LogScope) {
  const rows = await queryLogs(
    `SELECT level, fingerprint,
            sum(count) AS total_count,
            min(bucket) AS first_seen,
            max(bucket) AS last_seen,
            arg_max(sample_message, bucket) AS sample_message,
            arg_max(sample_request, bucket) AS sample_request,
            arg_max(sample_host, bucket) AS sample_host
     FROM nginx_error_agg
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND bucket BETWEEN $from AND $to
     GROUP BY level, fingerprint
     ORDER BY total_count DESC
     LIMIT 100`,
    rangeParams(scope),
  )
  return sanitizeLogRows(rows)
}

export async function phpErrorGroups(scope: LogScope) {
  const rows = await queryLogs(
    `SELECT fingerprint,
            arg_max(error_type, ts) AS error_type,
            arg_max(message, ts) AS sample_message,
            arg_max(src_file, ts) AS src_file,
            arg_max(src_line, ts) AS src_line,
            count(*) AS occurrences,
            min(ts) AS first_seen,
            max(ts) AS last_seen
     FROM php_error
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
     GROUP BY fingerprint
     ORDER BY occurrences DESC
     LIMIT 100`,
    rangeParams(scope),
  )
  return sanitizeLogRows(rows)
}

export async function phpErrorOccurrences(scope: LogScope, fingerprint: string) {
  const rows = await queryLogs(
    `SELECT ts, error_type, message, src_file, src_line, stack
     FROM php_error
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
       AND fingerprint = $fingerprint
     ORDER BY ts DESC
     LIMIT 50`,
    { ...rangeParams(scope), fingerprint },
  )
  return sanitizeLogRows(rows)
}
