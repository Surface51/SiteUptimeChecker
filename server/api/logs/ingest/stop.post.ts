import { getIngestStatus, requestIngestStop } from '../../../utils/logs/ingest/queue'

/** Asks the running ingest to wind down at the next parser-safe boundary. Idempotent, and a
 * no-op when nothing is running. Progress is observed on /api/logs/ingest/events as usual. */
export default defineEventHandler(() => {
  const status = getIngestStatus()
  if (!status.running) return { stopping: false, status }
  return { stopping: true, status: requestIngestStop('stop') }
})
