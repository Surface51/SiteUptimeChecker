import { getLogDbLease } from '../../../utils/logs/dbLease'

/** Handoff state, for the CLI and for debugging. Unauthenticated — it exposes only a PID and
 * an expiry, nothing actionable. */
export default defineEventHandler(() => {
  const lease = getLogDbLease()
  return {
    detached: !!lease,
    holderPid: lease?.pid ?? null,
    holderHost: lease?.hostname ?? null,
    leaseExpiresAt: lease?.expiresAt ?? null,
    serverPid: process.pid,
  }
})
