import type { IngestStatus } from '#shared/types'

const LEASE_TTL_MS = 60_000

export interface HandoffState {
  active: boolean
  token: string | null
  serverPresent: boolean
}

/**
 * Client for the server-side DB handoff. Best-effort: if no server answers, the CLI just
 * proceeds and relies on the file lock for mutual exclusion.
 */
export class ServerHandoff {
  token: string | null = null
  serverPresent = false

  constructor(
    private url: string,
    private noServer: boolean,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' }
    if (process.env.UPTIME_CLI_TOKEN) h.authorization = `Bearer ${process.env.UPTIME_CLI_TOKEN}`
    return h
  }

  private async post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`${this.url}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const err = new Error(`${path} -> ${res.status} ${text.slice(0, 300)}`)
      ;(err as any).status = res.status
      throw err
    }
    return res.json()
  }

  /** Returns true if the DB was detached, false if no server is running. Throws on a server
   * that answered but refused (e.g. a run in flight without --force). */
  async detach(force: boolean): Promise<boolean> {
    if (this.noServer) return false
    let result: any
    try {
      result = await this.post('/api/logs/db/detach', {
        pid: process.pid,
        force,
        ttlMs: LEASE_TTL_MS,
      })
    } catch (err: any) {
      if (typeof err?.status === 'number') throw err // server answered and refused
      return false // ECONNREFUSED / timeout / DNS — no server
    }
    this.token = result.token
    this.serverPresent = true
    return true
  }

  async heartbeat(status: IngestStatus): Promise<void> {
    if (!this.token) return
    try {
      await this.post('/api/logs/db/lease', { token: this.token, ttlMs: LEASE_TTL_MS, status })
    } catch {
      // a missed beat is fine; the TTL has slack and the PID watchdog is the real backstop
    }
  }

  async attach(): Promise<void> {
    if (!this.token) return
    try {
      await this.post('/api/logs/db/attach', { token: this.token })
    } finally {
      this.token = null
    }
  }
}
