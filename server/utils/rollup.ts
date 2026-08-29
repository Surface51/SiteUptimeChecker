import { getDb, listSites } from './db'

/**
 * Daily uptime rollups. Raw `checks` rows are kept for ~30 days; everything that needs a longer
 * horizon — the 90-day calendar, the adaptive response-time baseline, the SLA panel — reads the
 * `daily_uptime` table this module maintains.
 *
 * A rollup row is a pure function of the `checks` and `incidents` rows for that site-day, so
 * every entry point here is safe to re-run.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const CHECK_RETENTION_DAYS = 30
const ROLLUP_RETENTION_DAYS = Number(process.env.UPTIME_ROLLUP_RETENTION_DAYS ?? 730)

/** "YYYY-MM-DD" for a Date, in UTC — matches SQLite's date(checked_at). */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null
  const idx = Math.min(sortedAsc.length - 1, Math.ceil(sortedAsc.length * p) - 1)
  return sortedAsc[Math.max(0, idx)] ?? null
}

function sqlToMs(ts: string): number {
  return new Date(`${ts.replace(' ', 'T')}Z`).getTime()
}

/**
 * Time-weighted downtime over [fromMs, toMs), seconds: each incident interval
 * [started_at, ended_at ?? now] clipped to the window and summed.
 */
export function downSecondsInRange(siteId: number, fromMs: number, toMs: number): number {
  const now = Date.now()
  const rows = getDb()
    .prepare(
      `SELECT started_at, ended_at FROM incidents
       WHERE site_id = ?
         AND started_at < ?
         AND (ended_at IS NULL OR ended_at >= ?)`,
    )
    .all(siteId, utcSqlTimestamp(toMs), utcSqlTimestamp(fromMs)) as {
    started_at: string
    ended_at: string | null
  }[]

  let total = 0
  for (const r of rows) {
    const start = Math.max(fromMs, sqlToMs(r.started_at))
    const end = Math.min(toMs, r.ended_at ? sqlToMs(r.ended_at) : now)
    if (end > start) total += (end - start) / 1000
  }
  return Math.round(total)
}

/** Downtime for a single UTC day, seconds. */
export function downSecondsForDay(siteId: number, day: string): number {
  const dayStart = Date.parse(`${day}T00:00:00Z`)
  return downSecondsInRange(siteId, dayStart, dayStart + DAY_MS)
}

/** A JS Date -> the "YYYY-MM-DD HH:MM:SS" string form SQLite's datetime() produces (UTC). */
function utcSqlTimestamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

/** Recompute one site-day from raw checks + incidents and upsert it. */
export function rollupDay(siteId: number, day: string): void {
  const checks = getDb()
    .prepare(
      `SELECT status, time_total FROM checks
       WHERE site_id = ? AND date(checked_at) = ?`,
    )
    .all(siteId, day) as { status: string; time_total: number | null }[]

  let up = 0
  let degraded = 0
  let down = 0
  const times: number[] = []
  for (const c of checks) {
    if (c.status === 'down') down++
    else if (c.status === 'degraded') degraded++
    else up++
    if (c.time_total !== null) times.push(c.time_total)
  }
  times.sort((a, b) => a - b)

  const total = checks.length
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null
  const p50 = percentile(times, 0.5)
  const p95 = percentile(times, 0.95)
  const max = times.length ? times[times.length - 1]! : null
  const downSeconds = downSecondsForDay(siteId, day)

  getDb()
    .prepare(
      `INSERT INTO daily_uptime
         (site_id, day, total_checks, up_checks, degraded_checks, down_checks, avg_ms, p50_ms, p95_ms, max_ms, down_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(site_id, day) DO UPDATE SET
         total_checks = excluded.total_checks,
         up_checks = excluded.up_checks,
         degraded_checks = excluded.degraded_checks,
         down_checks = excluded.down_checks,
         avg_ms = excluded.avg_ms,
         p50_ms = excluded.p50_ms,
         p95_ms = excluded.p95_ms,
         max_ms = excluded.max_ms,
         down_seconds = excluded.down_seconds`,
    )
    .run(siteId, day, total, up, degraded, down, avg, p50, p95, max, downSeconds)
}

/** Roll up an inclusive day range for one site. */
export function rollupSiteRange(siteId: number, fromDay: string, toDay: string): void {
  let cursor = Date.parse(`${fromDay}T00:00:00Z`)
  const end = Date.parse(`${toDay}T00:00:00Z`)
  while (cursor <= end) {
    rollupDay(siteId, utcDay(new Date(cursor)))
    cursor += DAY_MS
  }
}

/** Roll up yesterday + today for every enabled site — the daily scheduler tick. */
export function rollupRecent(): void {
  const today = utcDay(new Date())
  const yesterday = utcDay(new Date(Date.now() - DAY_MS))
  for (const site of listSites()) {
    try {
      rollupSiteRange(site.id, yesterday, today)
    } catch (err) {
      console.error(`[rollup] failed for site ${site.id}:`, err)
    }
  }
}

/**
 * One-time (idempotent) catch-up: roll up every distinct day still present in `checks` for every
 * site. Called once on boot so an install upgrading to rollups keeps its recent history.
 */
export function backfillRollups(): void {
  const rows = getDb()
    .prepare(`SELECT DISTINCT site_id, date(checked_at) AS day FROM checks`)
    .all() as { site_id: number; day: string }[]
  for (const r of rows) {
    try {
      rollupDay(r.site_id, r.day)
    } catch (err) {
      console.error(`[rollup] backfill failed for site ${r.site_id} ${r.day}:`, err)
    }
  }
}

/**
 * Fleet-wide retention, run once a day by the scheduler (was a per-insert range delete in
 * insertCheck). Drops raw checks past CHECK_RETENTION_DAYS and rollup rows past the far longer
 * ROLLUP_RETENTION_DAYS.
 */
export function pruneOldData(): void {
  const db = getDb()
  db.prepare(`DELETE FROM checks WHERE checked_at < datetime('now', ?)`).run(`-${CHECK_RETENTION_DAYS} days`)
  db.prepare(`DELETE FROM daily_uptime WHERE day < date('now', ?)`).run(`-${ROLLUP_RETENTION_DAYS} days`)
}

let midnightTimer: NodeJS.Timeout | null = null
let dailyTimer: NodeJS.Timeout | null = null

function msUntilNextMidnight(): number {
  const now = new Date()
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return next.getTime() - now.getTime()
}

function tick(): void {
  try {
    rollupRecent()
    pruneOldData()
  } catch (err) {
    console.error('[rollup] daily tick failed:', err)
  }
}

/** First run at the next local midnight, then every 24h — matching the Lighthouse / log-retention cadence. */
export function startRollupScheduler(): void {
  midnightTimer = setTimeout(() => {
    tick()
    dailyTimer = setInterval(tick, DAY_MS)
  }, msUntilNextMidnight())
}

export function stopRollupScheduler(): void {
  if (midnightTimer) {
    clearTimeout(midnightTimer)
    midnightTimer = null
  }
  if (dailyTimer) {
    clearInterval(dailyTimer)
    dailyTimer = null
  }
}
