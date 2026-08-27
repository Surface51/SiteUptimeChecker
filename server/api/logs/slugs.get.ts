import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { listSites } from '../../utils/db'
import { getLogIngressDir } from '../../utils/logs/config'
import { queryLogs } from '../../utils/logs/logDb'
import { isValidLogSlug } from '../../utils/logs/slug'

/** Folder names sitting in log-ingress/ right now, including ones not yet ingested — which is
 * the case that matters when linking a site immediately after dropping its logs in. Symlinks
 * are resolved, since linking a log directory in from elsewhere is an expected way to use this. */
function foldersOnDisk(): string[] {
  const root = getLogIngressDir()
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) return false
        if (!isValidLogSlug(entry.name)) return false
        try {
          return statSync(join(root, entry.name)).isDirectory()
        } catch {
          return false
        }
      })
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

export default defineEventHandler(async () => {
  const ingested = await queryLogs(`SELECT name FROM sites ORDER BY name`).catch(() => [])
  const ingestedNames = ingested.map((row) => String(row.name))

  const linkedBy = new Map<string, number>()
  for (const site of listSites()) {
    if (site.logSlug) linkedBy.set(site.logSlug, site.id)
  }

  const names = [...new Set([...ingestedNames, ...foldersOnDisk()])].sort()

  return {
    slugs: names.map((name) => ({
      slug: name,
      ingested: ingestedNames.includes(name),
      linkedSiteId: linkedBy.get(name) ?? null,
    })),
  }
})
