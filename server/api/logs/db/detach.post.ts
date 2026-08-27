import { assertHandoffAllowed } from '../../../utils/logs/handoffAuth'
import { detachLogDb } from '../../../utils/logs/dbHandoff'

/** Hands the DuckDB log store off to an external process (the `logs:ingest` CLI). Responds
 * only once the database is fully closed and its lock file released. */
export default defineEventHandler(async (event) => {
  assertHandoffAllowed(event)

  const body = await readBody<{ pid?: unknown; ttlMs?: unknown; force?: unknown }>(event).catch(
    () => ({}) as { pid?: unknown; ttlMs?: unknown; force?: unknown },
  )
  const pid = Number(body?.pid)
  if (!Number.isInteger(pid) || pid <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Body must include a numeric { pid }' })
  }

  const result = await detachLogDb({
    pid,
    ttlMs: typeof body?.ttlMs === 'number' ? body.ttlMs : undefined,
    force: body?.force === true,
  })

  return {
    ok: true,
    token: result.lease.token,
    leaseExpiresAt: result.lease.expiresAt,
    serverPid: result.serverPid,
  }
})
