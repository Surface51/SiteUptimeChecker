import {
  pickAutoInterval,
  rangeParams,
  sanitizeLogRow,
  sanitizeLogRows,
  serverIdsClause,
  type LogScope,
} from '../apiHelpers'
import { queryLogs } from '../logDb'

export async function perfPercentiles(scope: LogScope) {
  const clause = serverIdsClause(scope.serverIds)
  const interval = pickAutoInterval(scope.from.getTime(), scope.to.getTime())
  const params = rangeParams(scope)

  const [overviewRows, seriesRows] = await Promise.all([
    queryLogs(
      `SELECT
         quantile_cont(duration, 0.5) AS p50,
         quantile_cont(duration, 0.95) AS p95,
         quantile_cont(duration, 0.99) AS p99,
         avg(duration) AS avg,
         max(duration) AS max,
         count(*) AS count
       FROM access_log
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to AND duration IS NOT NULL`,
      params,
    ),
    queryLogs(
      `SELECT
         time_bucket(INTERVAL '${interval}', ts) AS bucket,
         quantile_cont(duration, 0.5) AS p50,
         quantile_cont(duration, 0.95) AS p95,
         quantile_cont(duration, 0.99) AS p99
       FROM access_log
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to AND duration IS NOT NULL
       GROUP BY 1
       ORDER BY 1`,
      params,
    ),
  ])

  return { overview: sanitizeLogRow(overviewRows[0] || {}), interval, series: sanitizeLogRows(seriesRows) }
}

export async function perfEndpoints(scope: LogScope, opts: { limit: number; sort: string }) {
  const limit = Math.min(Math.max(Number(opts.limit) || 25, 1), 200)
  // Whitelist: this is interpolated into ORDER BY.
  const sort = opts.sort === 'total_time' ? 'total_time' : 'p95'

  const rows = await queryLogs(
    `SELECT
       path_pattern,
       count(*) AS requests,
       quantile_cont(duration, 0.5) AS p50,
       quantile_cont(duration, 0.95) AS p95,
       quantile_cont(duration, 0.99) AS p99,
       coalesce(sum(duration), 0) AS total_time
     FROM access_log
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
       AND duration IS NOT NULL
     GROUP BY path_pattern
     HAVING count(*) >= 5
     ORDER BY ${sort} DESC
     LIMIT ${limit}`,
    rangeParams(scope),
  )
  return sanitizeLogRows(rows)
}
