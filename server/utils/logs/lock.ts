import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function acquireLogDbLock(dbPath: string): () => void {
  const lockPath = `${dbPath}.lock`
  mkdirSync(dirname(dbPath), { recursive: true })

  if (existsSync(lockPath)) {
    const heldPid = Number(readFileSync(lockPath, 'utf-8').trim())
    // A process can't conflict with itself — Nitro's dev-mode HMR can re-run this module's
    // init logic within the same still-alive process (server-file edits reload the worker
    // without re-executing exit handlers), which would otherwise self-deadlock forever.
    if (heldPid && heldPid !== process.pid && isPidAlive(heldPid)) {
      throw new Error(
        `Database is already open by process ${heldPid} (lock file: ${lockPath}). ` +
        `Stop that process first, or delete the lock file if it crashed without cleaning up.`
      )
    }
  }

  writeFileSync(lockPath, String(process.pid))

  const release = () => {
    try {
      if (existsSync(lockPath) && Number(readFileSync(lockPath, 'utf-8').trim()) === process.pid) {
        rmSync(lockPath)
      }
    } catch {
      // best effort
    }
  }

  process.once('exit', release)
  process.once('SIGINT', () => { release(); process.exit(0) })
  process.once('SIGTERM', () => { release(); process.exit(0) })

  return release
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Like acquireLogDbLock, but retries briefly on conflict. Nitro's dev-mode HMR can restart the
 * server worker without the old process's exit handlers running before the new one starts,
 * leaving a momentarily stale lock — this rides out that overlap instead of failing hard. */
export async function acquireLogDbLockWithRetry(dbPath: string, attempts = 5, delayMs = 400): Promise<() => void> {
  for (let i = 0; i < attempts; i++) {
    try {
      return acquireLogDbLock(dbPath)
    } catch (err) {
      if (i === attempts - 1) throw err
      await sleep(delayMs)
    }
  }
  throw new Error('unreachable')
}
