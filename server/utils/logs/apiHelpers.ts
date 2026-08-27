import { queryLogs } from './logDb'

/** DuckDB returns 64-bit aggregates as BigInt, which JSON.stringify refuses to serialize. */
export function sanitizeLogRow(row: Record<string, unknown>): Record<string, unknown> {
  for (const k in row) {
    if (typeof row[k] === 'bigint') row[k] = Number(row[k])
  }
  return row
}

export function sanitizeLogRows<T extends Record<string, unknown>>(rows: T[]): Record<string, unknown>[] {
  return rows.map(sanitizeLogRow)
}

export interface LogTimeRange {
  from: Date
  to: Date
}

/** What every analytics query needs: which servers to read, over what window. */
export interface LogScope extends LogTimeRange {
  serverIds: number[]
}

/** Bind parameters for the `ts BETWEEN $from AND $to` predicate every query shares. */
export function rangeParams(scope: LogTimeRange): { from: string; to: string } {
  return { from: scope.from.toISOString(), to: scope.to.toISOString() }
}

const DEFAULT_RANGE_MS = 90 * 24 * 60 * 60 * 1000
const MAX_PAST_MS = 2 * 365 * 24 * 60 * 60 * 1000
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000

/** Bounds the range to avoid feeding unbounded scans/timeseries buckets to no-LIMIT queries:
 * defaults to the last 90 days, and clamps an explicit `from` to 2 years back. */
export function parseLogTimeRange(q: Record<string, unknown>): LogTimeRange {
  const now = Date.now()

  let fromMs = q.from ? new Date(String(q.from)).getTime() : now - DEFAULT_RANGE_MS
  if (Number.isNaN(fromMs)) fromMs = now - DEFAULT_RANGE_MS
  fromMs = Math.max(fromMs, now - MAX_PAST_MS)

  let toMs = q.to ? new Date(String(q.to)).getTime() : now
  if (Number.isNaN(toMs)) toMs = now
  toMs = Math.min(toMs, now + MAX_FUTURE_MS)

  return { from: new Date(fromMs), to: new Date(toMs) }
}

/** Shared across timeseries endpoints so bucket-count logic stays in one place. */
export function pickAutoInterval(fromMs: number, toMs: number): string {
  const spanHours = (toMs - fromMs) / (1000 * 60 * 60)
  if (spanHours <= 3) return '1 minute'
  if (spanHours <= 30) return '15 minutes'
  if (spanHours <= 24 * 30) return '1 hour'
  return '1 day'
}

// Interval strings are interpolated into SQL, so callers must only ever pass a key of this map;
// coerceLogInterval is the gate that guarantees that.
const INTERVAL_MS: Record<string, number> = {
  '1 minute': 60_000,
  '5 minutes': 5 * 60_000,
  '15 minutes': 15 * 60_000,
  '1 hour': 60 * 60_000,
  '1 day': 24 * 60 * 60_000,
}

const MAX_BUCKETS = 3000

/** Falls back to the auto-picked interval when a caller-supplied one (e.g. `interval=1m` over
 * a 90-day range) would produce an excessive number of time buckets, or isn't a known interval
 * at all — which also keeps unvalidated input out of the interpolated SQL. */
export function coerceLogInterval(fromMs: number, toMs: number, requestedInterval: string): string {
  const ms = INTERVAL_MS[requestedInterval]
  if (!ms) return pickAutoInterval(fromMs, toMs)
  if ((toMs - fromMs) / ms > MAX_BUCKETS) return pickAutoInterval(fromMs, toMs)
  return requestedInterval
}

/** Builds a safe `IN (...)` clause body from server-generated integer ids (never raw user input). */
export function serverIdsClause(serverIds: number[]): string {
  if (serverIds.length === 0) return '(-1)'
  return `(${serverIds.join(',')})`
}

/** Maps a log slug to the DuckDB server rows it covers, optionally narrowed to one environment.
 * Returns an empty serverIds list when the slug has no ingested data yet, which every query
 * handles as "no rows" rather than an error. */
export async function resolveLogServers(
  slug: string,
  env?: string,
): Promise<{ siteId: number | null; serverIds: number[] }> {
  const siteRows = await queryLogs(`SELECT site_id FROM sites WHERE name = $slug`, { slug })
  const siteRow = siteRows[0]
  if (!siteRow) return { siteId: null, serverIds: [] }

  const siteId = Number(siteRow.site_id)
  const serverRows = env
    ? await queryLogs(`SELECT server_id FROM servers WHERE site_id = $siteId AND env = $env`, { siteId, env })
    : await queryLogs(`SELECT server_id FROM servers WHERE site_id = $siteId`, { siteId })

  return { siteId, serverIds: serverRows.map((r) => Number(r.server_id)) }
}

/** Distinct environments ingested for a slug, for the environment picker. */
export async function listLogEnvs(slug: string): Promise<string[]> {
  const rows = await queryLogs(
    `SELECT DISTINCT sv.env AS env
     FROM servers sv JOIN sites s ON s.site_id = sv.site_id
     WHERE s.name = $slug
     ORDER BY env`,
    { slug },
  )
  return rows.map((r) => String(r.env))
}
