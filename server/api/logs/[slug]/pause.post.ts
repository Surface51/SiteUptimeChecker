import { isLogFolderPaused, setLogFolderPaused } from '../../../utils/db'
import { isValidLogSlug } from '../../../utils/logs/slug'

/** Pause or resume ingestion for one log folder. The flag lives in SQLite (see db.ts) so it
 * stays readable while the DuckDB log store is detached for a bulk CLI ingest. */
export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') ?? '')
  if (!isValidLogSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid log folder name' })
  }

  const body = await readBody<{ paused?: unknown }>(event)
  if (typeof body?.paused !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { paused: boolean }' })
  }

  setLogFolderPaused(slug, body.paused)
  return { slug, paused: isLogFolderPaused(slug) }
})
