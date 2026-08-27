import { getIngestStatus, runIngest } from '../../../utils/logs/ingest/queue'

export default defineEventHandler(() => {
  const status = getIngestStatus()
  if (status.running) {
    return { started: false, status }
  }

  // Fire-and-forget: ingestion can take minutes on a large backlog, so we don't block the
  // HTTP request. The client polls /api/logs/ingest/status or subscribes to
  // /api/logs/ingest/events for progress.
  runIngest().catch((err) => {
    console.error('[logs] ingest run failed:', err)
  })

  return { started: true, status: getIngestStatus() }
})
