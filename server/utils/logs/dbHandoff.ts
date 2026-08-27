import { hostname } from 'node:os'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import {
  beginLogDbDetach,
  endLogDbDetach,
  getLogDbLease,
  renewLogDbDetach,
  type LogDbLease,
} from './dbLease'
import { closeLogDb } from './logDb'
import { getIngestStatus, getCurrentIngestRun, ingestEvents, requestIngestStop } from './ingest/queue'
import { isLogWatchEnabled } from './config'
import {
  startLogIngestScheduler,
  startLogRetentionScheduler,
  stopLogIngestScheduler,
  stopLogRetentionScheduler,
} from './schedule'

const DEFAULT_TTL_MS = 60_000
const MAX_TTL_MS = 5 * 60_000
const STOP_WAIT_MS = 60_000

let watchdog: NodeJS.Timeout | null = null
/** Whether this process runs the ingest/retention schedulers (prod only). Restored on reattach. */
let schedulersManaged = false

export function setLogSchedulersManaged(v: boolean) {
  schedulersManaged = v
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err: any) {
    return err?.code === 'EPERM'
  }
}

async function stopSchedulersForHandoff() {
  stopLogIngestScheduler()
  stopLogRetentionScheduler()
  if (isLogWatchEnabled()) {
    const { stopLogWatcher } = await import('./ingest/watch')
    stopLogWatcher()
  }
}

async function restartSchedulersAfterHandoff() {
  if (!schedulersManaged) return
  startLogIngestScheduler()
  startLogRetentionScheduler()
  if (isLogWatchEnabled()) {
    const { startLogWatcher } = await import('./ingest/watch')
    startLogWatcher()
  }
}

export interface DetachResult {
  ok: true
  lease: LogDbLease
  serverPid: number
}

/**
 * Releases the DuckDB log store so an external process can hold its lock. Aborts any
 * server-side ingest in flight (that is the moment you most want the CLI), stops the
 * schedulers, then fully closes the database — the lock file is gone by the time this returns.
 */
export async function detachLogDb(opts: { pid: number; ttlMs?: number; force?: boolean }): Promise<DetachResult> {
  const existing = getLogDbLease()
  if (existing) {
    if (existing.pid === opts.pid) {
      return { ok: true, lease: existing, serverPid: process.pid }
    }
    throw createError({
      statusCode: 409,
      statusMessage: `Log database already detached by pid ${existing.pid}`,
    })
  }

  const status = getIngestStatus()
  if (status.running) {
    if (!opts.force) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A server-side ingest is running; retry with { force: true } to abort it',
      })
    }
    requestIngestStop('detach')
    const run = getCurrentIngestRun()
    if (run) {
      await Promise.race([
        run,
        new Promise((_, reject) =>
          setTimeout(() => reject(createError({ statusCode: 409, statusMessage: 'Timed out stopping the running ingest' })), STOP_WAIT_MS),
        ),
      ])
    }
  }

  await stopSchedulersForHandoff()

  const ttlMs = Math.min(opts.ttlMs ?? DEFAULT_TTL_MS, MAX_TTL_MS)
  const lease = beginLogDbDetach({
    pid: opts.pid,
    hostname: hostname(),
    token: randomBytes(18).toString('hex'),
    ttlMs,
  })

  // Close only after the lease is set, so no request can race in and re-open via ensureLogDb().
  await closeLogDb()

  startLeaseWatchdog()
  return { ok: true, lease, serverPid: process.pid }
}

export function renewLease(token: string, ttlMs?: number): { ok: boolean; expiresAt?: number } {
  const ok = renewLogDbDetach(token, Math.min(ttlMs ?? DEFAULT_TTL_MS, MAX_TTL_MS))
  const lease = getLogDbLease()
  return ok && lease ? { ok, expiresAt: lease.expiresAt } : { ok: false }
}

/** Ends the handoff and lets the schedulers (and lazy re-open) resume. */
export async function attachLogDb(token?: string): Promise<{ ok: true; reopened: boolean }> {
  endLogDbDetach(token)
  stopLeaseWatchdog()
  await restartSchedulersAfterHandoff()
  // The external status is gone now; push the (idle) server status so SSE subscribers see the
  // run end instead of staying stuck on the CLI's last "running" frame.
  ingestEvents.emit('progress', getIngestStatus())
  return { ok: true, reopened: schedulersManaged }
}

/**
 * Backstops a crashed CLI: reattaches once the holder PID is gone or the lease TTL lapses.
 * Reattach still flows through the file lock, so a stalled-but-alive CLI can't cause a
 * double open — we just wait and retry.
 */
function startLeaseWatchdog() {
  if (watchdog) return
  watchdog = setInterval(() => {
    const lease = getLogDbLease()
    if (!lease) {
      stopLeaseWatchdog()
      return
    }
    const sameHost = lease.hostname === hostname()
    if (sameHost && !isPidAlive(lease.pid)) {
      console.warn(`[logs] detach holder pid ${lease.pid} is gone — reattaching log database`)
      void attachLogDb()
    }
  }, 2000)
  watchdog.unref?.()
}

function stopLeaseWatchdog() {
  if (watchdog) {
    clearInterval(watchdog)
    watchdog = null
  }
}

/** Called at server startup to resume watching a lease that outlived a restart. */
export function resumeLeaseWatchdogIfDetached() {
  if (getLogDbLease()) startLeaseWatchdog()
}
