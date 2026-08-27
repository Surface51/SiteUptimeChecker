import { assertHandoffAllowed } from '../../../utils/logs/handoffAuth'
import { renewLease } from '../../../utils/logs/dbHandoff'
import { setExternalIngestStatus } from '../../../utils/logs/dbLease'
import { ingestEvents } from '../../../utils/logs/ingest/queue'
import type { IngestStatus } from '#shared/types'

/** Heartbeat + progress relay in one call: extends the detach lease and republishes the
 * CLI's IngestStatus on the SSE stream so the web UI keeps showing progress. */
export default defineEventHandler(async (event) => {
  assertHandoffAllowed(event)

  const body = await readBody<{ token?: unknown; ttlMs?: unknown; status?: IngestStatus }>(event)
  if (typeof body?.token !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Body must include { token }' })
  }

  const result = renewLease(body.token, typeof body.ttlMs === 'number' ? body.ttlMs : undefined)
  if (!result.ok) {
    throw createError({ statusCode: 409, statusMessage: 'No active lease for that token' })
  }

  if (body.status && typeof body.status === 'object') {
    const relayed: IngestStatus = { ...body.status, source: 'cli' }
    setExternalIngestStatus(relayed)
    ingestEvents.emit('progress', relayed)
  }

  return { ok: true, leaseExpiresAt: result.expiresAt }
})
