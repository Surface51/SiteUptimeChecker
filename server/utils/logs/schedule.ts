import { existsSync } from 'node:fs'
import { getLogRetentionDays } from './config'
import { withLogWrite, queryLogs } from './logDb'
import { getIngestStatus } from './ingest/queue'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

let ingestTimer: NodeJS.Timeout | null = null
let initialIngestTimer: NodeJS.Timeout | null = null
let midnightTimer: NodeJS.Timeout | null = null
let retentionTimer: NodeJS.Timeout | null = null

function jitter(ms: number): number {
  const spread = ms * 0.1
  return ms + (Math.random() * 2 - 1) * spread
}

async function tickIngest() {
  // A run already in flight (manual trigger, or a previous tick still working through a
  // large backlog) owns the write connection; skipping is enough, since the next tick
  // picks up whatever it didn't finish.
  if (getIngestStatus().running) return

  try {
    const { runIngest } = await import('./ingest/queue')
    await runIngest()
  } catch (err) {
    console.error('[logs] scheduled ingest failed:', err)
  }
}

/**
 * Ingests hourly. Unlike the Lighthouse sweep this does run shortly after startup (jittered by a
 * minute or so), because ingestion is cheap when there's nothing new — it reads each file from
 * its recorded byte offset — and log data going stale is the whole failure mode to avoid.
 */
export function startLogIngestScheduler() {
  initialIngestTimer = setTimeout(() => {
    void tickIngest()
    ingestTimer = setInterval(() => void tickIngest(), HOUR_MS)
  }, jitter(60_000))
}

export function stopLogIngestScheduler() {
  if (initialIngestTimer) {
    clearTimeout(initialIngestTimer)
    initialIngestTimer = null
  }
  if (ingestTimer) {
    clearInterval(ingestTimer)
    ingestTimer = null
  }
}

// Every table holding parsed log rows, with the column that dates a row. nginx errors are
// stored pre-aggregated into per-minute buckets, hence the different column.
const RETENTION_TABLES: { table: string; timeColumn: string }[] = [
  { table: 'access_log', timeColumn: 'ts' },
  { table: 'nginx_error_agg', timeColumn: 'bucket' },
  { table: 'php_error', timeColumn: 'ts' },
  { table: 'fpm_events', timeColumn: 'ts' },
  { table: 'php_slow', timeColumn: 'ts' },
  { table: 'mysql_slow', timeColumn: 'ts' },
  { table: 'db_events', timeColumn: 'ts' },
]

/**
 * Drops log rows older than the retention window.
 *
 * Deliberately leaves `ingest_files` rows alone for files that still exist on disk: that table is
 * what makes ingestion resumable, and a rotated or .gz file is ingested exactly once and then
 * never re-read. Forgetting such a file would make the next run re-ingest the very rows this
 * just pruned. Only bookkeeping for files that have since disappeared is cleaned up.
 */
export async function pruneLogRetention(): Promise<void> {
  const days = getLogRetentionDays()

  await withLogWrite(async (conn) => {
    for (const { table, timeColumn } of RETENTION_TABLES) {
      await conn.run(
        `DELETE FROM ${table} WHERE ${timeColumn} < now() - INTERVAL '${days} days'`,
      )
    }
  })

  const tracked = (await queryLogs(`SELECT file_id, path FROM ingest_files`)) as {
    file_id: number
    path: string
  }[]
  const goneIds = tracked.filter((row) => !existsSync(row.path)).map((row) => row.file_id)

  if (goneIds.length > 0) {
    await withLogWrite(async (conn) => {
      await conn.run(`DELETE FROM ingest_files WHERE file_id IN (${goneIds.join(',')})`)
    })
  }

  // Reclaim the freed pages; without this the file keeps growing across prunes.
  await withLogWrite(async (conn) => {
    await conn.run(`CHECKPOINT`)
  })
}

function msUntilNextMidnight(): number {
  const now = new Date()
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return next.getTime() - now.getTime()
}

function runRetention() {
  pruneLogRetention().catch((err) => {
    console.error('[logs] retention prune failed:', err)
  })
}

/** Prunes at the next local midnight, then daily — matching the Lighthouse sweep's off-hours
 * cadence, since a large delete plus CHECKPOINT is the one genuinely heavy log operation. */
export function startLogRetentionScheduler() {
  midnightTimer = setTimeout(() => {
    runRetention()
    retentionTimer = setInterval(runRetention, DAY_MS)
  }, msUntilNextMidnight())
}

export function stopLogRetentionScheduler() {
  if (midnightTimer) {
    clearTimeout(midnightTimer)
    midnightTimer = null
  }
  if (retentionTimer) {
    clearInterval(retentionTimer)
    retentionTimer = null
  }
}
