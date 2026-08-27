import { getIngestStatus, runIngest } from '../../../utils/logs/ingest/queue'
import { isLogDbDetached } from '../../../utils/logs/dbLease'
import { isValidLogSlug } from '../../../utils/logs/slug'

export default defineEventHandler(async (event) => {
  if (isLogDbDetached()) {
    return { started: false, reason: 'detached', status: getIngestStatus() }
  }

  const status = getIngestStatus()
  if (status.running) {
    return { started: false, reason: 'running', status }
  }

  // Optional { slug } restricts the run to one folder — used by the per-folder "Ingest now"
  // on the log status page.
  const body = await readBody<{ slug?: unknown }>(event).catch(() => ({}) as { slug?: unknown })
  let onlySlugs: string[] | undefined
  if (typeof body?.slug === 'string' && body.slug) {
    if (!isValidLogSlug(body.slug)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid log folder name' })
    }
    onlySlugs = [body.slug]
  }

  // Fire-and-forget: ingestion can take minutes on a large backlog, so we don't block the
  // HTTP request. The client polls /api/logs/ingest/status or subscribes to
  // /api/logs/ingest/events for progress.
  runIngest(undefined, { onlySlugs }).catch((err) => {
    console.error('[logs] ingest run failed:', err)
  })

  return { started: true, status: getIngestStatus() }
})
