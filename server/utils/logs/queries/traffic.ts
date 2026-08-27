import { createError } from 'h3'
import {
  coerceLogInterval,
  pickAutoInterval,
  rangeParams,
  sanitizeLogRow,
  sanitizeLogRows,
  serverIdsClause,
  type LogScope,
} from '../apiHelpers'
import { queryLogs } from '../logDb'

export async function trafficOverview(scope: LogScope) {
  const rows = await queryLogs(
    `SELECT
       count(*) AS requests,
       approx_count_distinct(client_ip) AS unique_visitors,
       coalesce(sum(bytes), 0) AS bytes,
       sum(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS count_5xx,
       sum(CASE WHEN status >= 400 AND status < 500 THEN 1 ELSE 0 END) AS count_4xx,
       avg(duration) AS avg_duration,
       quantile_cont(duration, 0.5) AS median_duration,
       sum(CASE WHEN is_bot THEN 1 ELSE 0 END) AS bot_requests
     FROM access_log
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to`,
    rangeParams(scope),
  )
  return sanitizeLogRow(rows[0] || {})
}

// Both maps are whitelists: their values are interpolated into SQL, so a metric or interval that
// isn't a key here must never reach the query.
const METRIC_EXPR: Record<string, string> = {
  requests: 'count(*)',
  bytes: 'coalesce(sum(bytes), 0)',
  uniques: 'approx_count_distinct(client_ip)',
}

const INTERVAL_MAP: Record<string, string> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '15m': '15 minutes',
  '1h': '1 hour',
  '1d': '1 day',
}

/** Resolves a caller-supplied interval token to a SQL interval, defaulting to one picked from
 * the span. Returns null for an unrecognized token so the route can 400. */
export function resolveInterval(scope: LogScope, token: string): string | null {
  const requested =
    token === 'auto' ? pickAutoInterval(scope.from.getTime(), scope.to.getTime()) : INTERVAL_MAP[token]
  if (!requested) return null
  return coerceLogInterval(scope.from.getTime(), scope.to.getTime(), requested)
}

export async function trafficTimeseries(
  scope: LogScope,
  opts: { metric: string; interval: string; groupBy: string },
) {
  const metricExpr = METRIC_EXPR[opts.metric]
  if (!metricExpr) throw createError({ statusCode: 400, statusMessage: `Invalid metric: ${opts.metric}` })

  const interval = resolveInterval(scope, opts.interval)
  if (!interval) throw createError({ statusCode: 400, statusMessage: `Invalid interval: ${opts.interval}` })

  const groupExpr =
    opts.groupBy === 'status_class'
      ? `CASE WHEN status < 300 THEN '2xx' WHEN status < 400 THEN '3xx' WHEN status < 500 THEN '4xx' ELSE '5xx' END`
      : `'all'`

  const rows = await queryLogs(
    `SELECT
       time_bucket(INTERVAL '${interval}', ts) AS bucket,
       ${groupExpr} AS series,
       ${metricExpr} AS value
     FROM access_log
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
     GROUP BY 1, 2
     ORDER BY 1`,
    rangeParams(scope),
  )

  return { interval, series: sanitizeLogRows(rows) }
}

/** Compact last-24h figures plus an hourly sparkline, for the site detail page and /compare. */
export async function trafficSummary(scope: LogScope) {
  const clause = serverIdsClause(scope.serverIds)
  const params = rangeParams(scope)

  const [totals, hourly] = await Promise.all([
    queryLogs(
      `SELECT
         count(*) AS requests,
         approx_count_distinct(client_ip) AS unique_visitors,
         coalesce(sum(bytes), 0) AS bytes,
         sum(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS count_5xx,
         sum(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS count_errors,
         quantile_cont(duration, 0.95) AS p95
       FROM access_log
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to`,
      params,
    ),
    queryLogs(
      `SELECT time_bucket(INTERVAL '1 hour', ts) AS bucket, count(*) AS value
       FROM access_log
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to
       GROUP BY 1
       ORDER BY 1`,
      params,
    ),
  ])

  const row = sanitizeLogRow(totals[0] || {})
  const requests = Number(row.requests ?? 0)

  return {
    requests,
    uniqueVisitors: Number(row.unique_visitors ?? 0),
    bytes: Number(row.bytes ?? 0),
    count5xx: Number(row.count_5xx ?? 0),
    errorRate: requests ? (Number(row.count_errors ?? 0) / requests) * 100 : 0,
    p95: row.p95 === null || row.p95 === undefined ? null : Number(row.p95),
    sparkline: sanitizeLogRows(hourly).map((point) => Number(point.value)),
  }
}

export async function trafficStatusCodes(scope: LogScope) {
  const rows = await queryLogs(
    `SELECT status, count(*) AS count
     FROM access_log
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
     GROUP BY status
     ORDER BY count DESC`,
    rangeParams(scope),
  )
  return sanitizeLogRows(rows)
}

const DIM_COLUMN: Record<string, string> = {
  path: 'path',
  path_pattern: 'path_pattern',
  referer: 'referer',
  client_ip: 'client_ip',
  user_agent: 'user_agent',
  country: 'country',
}

export async function trafficTop(scope: LogScope, opts: { dim: string; limit: number }) {
  const column = DIM_COLUMN[opts.dim]
  if (!column) throw createError({ statusCode: 400, statusMessage: `Invalid dim: ${opts.dim}` })

  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 200)

  const rows = await queryLogs(
    `SELECT ${column} AS value,
            count(*) AS requests,
            coalesce(sum(bytes), 0) AS bytes,
            avg(duration) AS avg_duration,
            sum(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS error_count
     FROM access_log
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
       AND ${column} IS NOT NULL AND ${column} != ''
     GROUP BY ${column}
     ORDER BY requests DESC
     LIMIT ${limit}`,
    rangeParams(scope),
  )
  return sanitizeLogRows(rows)
}
