import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IngestStatus } from '#shared/types'
import { getLogDbPath } from './config'

/**
 * Tracks whether the DuckDB log store has been handed off to an external process (the
 * `logs:ingest` CLI), which then holds the file lock while it bulk-ingests. While a lease is
 * active the server must not re-open the database — `ensureLogDb()` checks `isLogDbDetached()`
 * and refuses.
 *
 * The lease is persisted next to the database so a `nuxt dev` HMR restart (or any restart)
 * mid-handoff doesn't produce a server that fights the CLI for the lock. It carries a TTL as a
 * backstop and the holder's PID for fast liveness-based recovery; the file lock itself remains
 * the real mutex (a reattach still goes through `acquireLogDbLockWithRetry`).
 *
 * This module deliberately has no dependency on `logDb.ts` — that would be an import cycle.
 */

export interface LogDbLease {
  pid: number
  hostname: string
  token: string
  /** Epoch ms. */
  expiresAt: number
}

let lease: LogDbLease | null = null
/** The CLI's own IngestStatus, relayed on each heartbeat so the web UI keeps showing progress. */
let externalStatus: IngestStatus | null = null

function leasePath(): string {
  return `${getLogDbPath()}.lease`
}

function persist() {
  try {
    if (lease) writeFileSync(leasePath(), JSON.stringify(lease))
    else if (existsSync(leasePath())) rmSync(leasePath())
  } catch {
    // best effort — the in-memory state is authoritative for this process
  }
}

/** Re-reads a lease left on disk by a previous process. Call once at server startup. */
export function loadLogDbLeaseFromDisk(): void {
  try {
    if (!existsSync(leasePath())) return
    const parsed = JSON.parse(readFileSync(leasePath(), 'utf-8')) as LogDbLease
    if (parsed && typeof parsed.expiresAt === 'number' && parsed.expiresAt > Date.now()) {
      lease = parsed
    } else {
      rmSync(leasePath(), { force: true })
    }
  } catch {
    // ignore a corrupt lease file
  }
}

export function beginLogDbDetach(opts: { pid: number; hostname: string; token: string; ttlMs: number }): LogDbLease {
  lease = {
    pid: opts.pid,
    hostname: opts.hostname,
    token: opts.token,
    expiresAt: Date.now() + opts.ttlMs,
  }
  externalStatus = null
  persist()
  return lease
}

/** Extends the lease if the token matches. Returns false if there is no matching active lease. */
export function renewLogDbDetach(token: string, ttlMs: number): boolean {
  if (!lease || lease.token !== token) return false
  lease.expiresAt = Date.now() + ttlMs
  persist()
  return true
}

export function endLogDbDetach(token?: string): void {
  if (token && lease && lease.token !== token) return
  lease = null
  externalStatus = null
  persist()
}

/** The active lease, or null if none / expired (an expired lease is cleared as a side effect). */
export function getLogDbLease(): LogDbLease | null {
  if (lease && lease.expiresAt <= Date.now()) {
    lease = null
    externalStatus = null
    persist()
  }
  return lease
}

export function isLogDbDetached(): boolean {
  return getLogDbLease() !== null
}

export function setExternalIngestStatus(status: IngestStatus): void {
  externalStatus = status
}

export function getExternalIngestStatus(): IngestStatus | null {
  return getLogDbLease() ? externalStatus : null
}
