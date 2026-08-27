import { withLogWrite } from '../../../utils/logs/logDb'
import { isValidLogSlug } from '../../../utils/logs/slug'

// Every table keyed by server_id, plus the ingest bookkeeping, so a purge really does forget
// the slug rather than leaving offsets that would stop it being re-read.
const ROW_TABLES = [
  'access_log',
  'nginx_error_agg',
  'php_error',
  'fpm_events',
  'php_slow',
  'mysql_slow',
  'db_events',
  'ip_profiles',
]

/**
 * Drops all ingested log data for a slug. Deliberately not wired into site deletion: the files
 * on disk are the source of truth and would simply be re-ingested on the next run, so forgetting
 * them is an explicit act. Re-running ingest after a purge rebuilds everything from scratch.
 */
export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') ?? '')
  if (!isValidLogSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid log folder name' })
  }

  return withLogWrite(async (conn) => {
    const siteRows = await conn.runAndReadAll(`SELECT site_id FROM sites WHERE name = $slug`, { slug })
    const siteId = (siteRows.getRowObjectsJS()[0] as { site_id?: number } | undefined)?.site_id
    if (siteId === undefined) {
      throw createError({ statusCode: 404, statusMessage: `No ingested logs for "${slug}"` })
    }

    const scope = `(SELECT server_id FROM servers WHERE site_id = $siteId)`
    for (const table of ROW_TABLES) {
      await conn.run(`DELETE FROM ${table} WHERE server_id IN ${scope}`, { siteId })
    }
    await conn.run(`DELETE FROM ingest_files WHERE server_id IN ${scope}`, { siteId })
    await conn.run(`DELETE FROM servers WHERE site_id = $siteId`, { siteId })
    await conn.run(`DELETE FROM sites WHERE site_id = $siteId`, { siteId })
    await conn.run(`CHECKPOINT`)

    return { purged: slug }
  })
})
