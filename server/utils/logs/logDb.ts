import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { getLogDbPath } from './config'
import { acquireLogDbLockWithRetry } from './lock'
import { migrateLogDb } from './schema'

// The log analytics store. Deliberately separate from the SQLite database in server/utils/db.ts:
// SQLite stays the source of truth for sites/checks/incidents, while DuckDB holds parsed log rows,
// where its columnar engine handles the aggregate scans (GROUP BY over millions of requests) that
// the analytics endpoints are made of. Nothing joins across the two in SQL — the link is
// sites.log_slug (SQLite) matching a site name here, resolved in JS.

interface PooledConnection {
  conn: DuckDBConnection
  queue: Promise<unknown>
}

let instance: DuckDBInstance | null = null
let writeConnection: DuckDBConnection | null = null
const readPool: PooledConnection[] = []
const READ_POOL_SIZE = Number(process.env.DUCKDB_READ_POOL) || 2
let readCursor = 0

let writeQueue: Promise<unknown> = Promise.resolve()
let initPromise: Promise<void> | null = null
let releaseLock: (() => void) | null = null

async function init(): Promise<void> {
  const dbPath = getLogDbPath()
  mkdirSync(dirname(dbPath), { recursive: true })
  releaseLock = await acquireLogDbLockWithRetry(dbPath)

  instance = await DuckDBInstance.create(dbPath, {
    memory_limit: process.env.DUCKDB_MEMORY_LIMIT || '1GB',
    threads: process.env.DUCKDB_THREADS || '2',
    temp_directory: join(dirname(dbPath), 'tmp'),
    max_temp_directory_size: '4GB',
    preserve_insertion_order: 'false',
    // Without this, DuckDB's allocator can leave RSS at the peak of a single big query (e.g. a
    // high-cardinality GROUP BY) indefinitely — logically freed memory that's never handed back
    // to the OS. The background thread reclaims it within a couple seconds of the query finishing.
    allocator_background_threads: 'true',
  })
  writeConnection = await instance.connect()
  await migrateLogDb(writeConnection)

  for (let i = 0; i < READ_POOL_SIZE; i++) {
    readPool.push({ conn: await instance.connect(), queue: Promise.resolve() })
  }
}

/** Opens the log database on first use. Never called at boot — an uptime install with no logs
 * should never pay for a DuckDB instance or hold its lock file. */
export async function ensureLogDb(): Promise<void> {
  if (!initPromise) initPromise = init()
  return initPromise
}

/** Runs a function exclusively on the single write connection, serialized with all other writes. */
export async function withLogWrite<T>(fn: (conn: DuckDBConnection) => Promise<T>): Promise<T> {
  await ensureLogDb()
  const run = writeQueue.then(() => fn(writeConnection!))
  // Swallow rejection in the chain itself so one failed write doesn't wedge the queue,
  // while still propagating the error to this call's caller via `run`.
  writeQueue = run.catch(() => {})
  return run
}

/** Closes and reopens the write connection, serialized behind any in-flight write.
 * Used between ingest files to bound native-side memory tied to a long-lived connection. */
export async function recycleLogWriteConnection(): Promise<void> {
  await withLogWrite(async () => {
    const old = writeConnection
    writeConnection = await instance!.connect()
    old?.closeSync()
  })
}

/** Borrows a read connection from the small round-robin pool for a single query.
 * Each connection has its own queue so concurrent callers hitting the same slot are
 * serialized on it (a DuckDB connection can't run two overlapping queries at once) —
 * different pool slots still run fully in parallel. */
export async function withLogRead<T>(fn: (conn: DuckDBConnection) => Promise<T>): Promise<T> {
  await ensureLogDb()
  const slot = readPool[readCursor % readPool.length]
  readCursor++
  if (!slot) throw new Error('Read connection pool not initialized')

  const run = slot.queue.then(() => fn(slot.conn))
  slot.queue = run.catch(() => {})
  return run
}

export async function queryLogs(
  sql: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  return withLogRead(async (conn) => {
    const reader = params ? await conn.runAndReadAll(sql, params as any) : await conn.runAndReadAll(sql)
    return reader.getRowObjectsJS() as Record<string, unknown>[]
  })
}

/** Releases the instance and its lock file. Wired into the Nitro `close` hook so a restart
 * doesn't have to wait out the lock's stale-PID retry, and so tests can reopen a fresh DB. */
export async function closeLogDb(): Promise<void> {
  if (!initPromise) return

  // Wait for in-flight work rather than closing connections out from under it.
  await initPromise.catch(() => {})
  await writeQueue.catch(() => {})
  await Promise.all(readPool.map((slot) => slot.queue.catch(() => {})))

  for (const slot of readPool) slot.conn.closeSync()
  readPool.length = 0
  readCursor = 0

  writeConnection?.closeSync()
  writeConnection = null
  instance?.closeSync()
  instance = null

  releaseLock?.()
  releaseLock = null
  writeQueue = Promise.resolve()
  initPromise = null
}
