import { listLogFolderSettings, listSites } from '../../utils/db'
import { getLogIngressDir } from '../../utils/logs/config'
import { discoverRoots, type DiscoveredFile } from '../../utils/logs/discovery'
import { getIngestStatus } from '../../utils/logs/ingest/queue'
import { isLogDbDetached } from '../../utils/logs/dbLease'
import { queryLogs } from '../../utils/logs/logDb'
import { sanitizeLogRows } from '../../utils/logs/apiHelpers'

/**
 * Everything the /logs status page needs: every folder in log-ingress/ (including ones never
 * ingested and ones linked to no monitored site), its per-file import state from the DuckDB
 * `ingest_files` bookkeeping, and its paused flag. The three sources — disk, DuckDB, SQLite —
 * are joined here in JS, since nothing joins SQLite and DuckDB in SQL.
 */

interface IngestFileRow {
  path: string
  status: string
  byte_offset: number
  lines_ingested: number
  parse_errors: number
  last_error: string | null
  updated_at: string | null
  env: string | null
  ip: string | null
}

interface StatusFile {
  path: string
  filename: string
  logType: string
  env: string
  ip: string
  compressed: boolean
  mutable: boolean
  size: number
  byteOffset: number
  status: string
  linesIngested: number
  parseErrors: number
  lastError: string | null
  updatedAt: string | null
}

export default defineEventHandler(async () => {
  const roots = [getLogIngressDir()]
  let discovered: DiscoveredFile[] = []
  try {
    discovered = discoverRoots(roots)
  } catch {
    discovered = []
  }

  // Per-file bookkeeping. Absent (detached store, or nothing ingested yet) is not an error.
  let ingestRows: IngestFileRow[] = []
  let logStoreOffline = isLogDbDetached()
  if (!logStoreOffline) {
    try {
      ingestRows = sanitizeLogRows(
        await queryLogs(
          `SELECT f.path, f.status, f.byte_offset, f.lines_ingested, f.parse_errors,
                  f.last_error, CAST(f.updated_at AS VARCHAR) AS updated_at,
                  sv.env, sv.ip
           FROM ingest_files f
           LEFT JOIN servers sv ON sv.server_id = f.server_id`,
        ),
      ) as unknown as IngestFileRow[]
    } catch {
      logStoreOffline = true
    }
  }
  const ingestByPath = new Map(ingestRows.map((r) => [r.path, r]))

  const linkedBySlug = new Map<string, { id: number; name: string | null; url: string }>()
  for (const site of listSites()) {
    if (site.logSlug) linkedBySlug.set(site.logSlug, { id: site.id, name: site.name, url: site.url })
  }
  const pausedBySlug = new Map(listLogFolderSettings().map((s) => [s.slug, s.paused]))

  // Group discovered files by folder (site slug).
  const bySlug = new Map<string, DiscoveredFile[]>()
  for (const f of discovered) {
    const list = bySlug.get(f.site) ?? []
    list.push(f)
    bySlug.set(f.site, list)
  }
  // A folder can be paused / previously ingested but currently have no files on disk.
  for (const slug of new Set([...pausedBySlug.keys(), ...ingestRows.map((r) => folderOfPath(r.path, roots))])) {
    if (slug && !bySlug.has(slug)) bySlug.set(slug, [])
  }

  const folders = [...bySlug.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, files]) => {
      const envs = new Set<string>()
      const servers = new Set<string>()
      let bytesOnDisk = 0
      let bytesIngested = 0
      let linesIngested = 0
      let parseErrors = 0
      let lastIngestAt: string | null = null
      let lastError: string | null = null
      const counts = { new: 0, pending: 0, running: 0, stopped: 0, done: 0, error: 0 }

      const outFiles: StatusFile[] = files
        .map((f): StatusFile => {
          envs.add(f.env)
          servers.add(f.ip)
          bytesOnDisk += f.size
          const rec = ingestByPath.get(f.absPath)
          const status = rec?.status ?? 'new'
          countStatus(counts, status)
          if (rec) {
            bytesIngested += Math.min(rec.byte_offset, f.size)
            linesIngested += rec.lines_ingested
            parseErrors += rec.parse_errors
            if (rec.updated_at && (!lastIngestAt || rec.updated_at > lastIngestAt)) lastIngestAt = rec.updated_at
            if (rec.last_error) lastError = rec.last_error
          }
          return {
            path: f.absPath,
            filename: f.filename,
            logType: f.classified.logType,
            env: f.env,
            ip: f.ip,
            compressed: f.classified.compressed,
            mutable: f.classified.mutable,
            size: f.size,
            byteOffset: rec?.byte_offset ?? 0,
            status,
            linesIngested: rec?.lines_ingested ?? 0,
            parseErrors: rec?.parse_errors ?? 0,
            lastError: rec?.last_error ?? null,
            updatedAt: rec?.updated_at ?? null,
          }
        })
        .sort((a, b) => b.size - a.size)

      return {
        slug,
        paused: pausedBySlug.get(slug) ?? false,
        linkedSite: linkedBySlug.get(slug) ?? null,
        envs: [...envs].sort(),
        servers: servers.size,
        filesOnDisk: files.length,
        bytesOnDisk,
        bytesIngested,
        linesIngested,
        parseErrors,
        filesNew: counts.new,
        filesPending: counts.pending,
        filesRunning: counts.running,
        filesStopped: counts.stopped,
        filesDone: counts.done,
        filesErrored: counts.error,
        lastIngestAt,
        lastError,
        files: outFiles,
      }
    })

  return {
    ingest: getIngestStatus(),
    logStoreOffline,
    generatedAt: new Date().toISOString(),
    folders,
  }
})

function countStatus(counts: Record<string, number>, status: string) {
  if (status in counts) counts[status]!++
  else counts.pending!++
}

/** log-ingress/<slug>/<env>/<ip>/<file> — the slug is the first segment under a root. */
function folderOfPath(p: string, roots: string[]): string | null {
  for (const root of roots) {
    if (p.startsWith(root)) {
      const rest = p.slice(root.length).replace(/^[/\\]+/, '')
      const seg = rest.split(/[/\\]/)[0]
      if (seg) return seg
    }
  }
  return null
}
