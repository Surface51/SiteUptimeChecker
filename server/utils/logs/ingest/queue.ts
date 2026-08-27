import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import type { DuckDBAppender, DuckDBConnection } from '@duckdb/node-api'
import { discoverRoots, type DiscoveredFile, type LogType } from '../discovery'
import { getLogIngressDir } from '../config'
import { withLogWrite, recycleLogWriteConnection } from '../logDb'
import { clearGeoCache } from '../enrich/geo'
import { clearUaCache } from '../enrich/ua'
import { invalidateSitesCache } from '../sitesCache'
import { getOrCreateSite, getOrCreateServer, getFileRecord, insertFileRecord, updateFileMeta, updateFileProgress, resetFileForRotation, tableForLogType } from './state'
import { computeHeadHash, openLineSource } from './stream'
import { NginxAccessParser } from '../parsers/nginxAccess'
import { NginxErrorParser } from '../parsers/nginxError'
import { PhpErrorParser } from '../parsers/phpError'
import { PhpFpmParser } from '../parsers/phpFpm'
import { PhpSlowParser } from '../parsers/phpSlow'
import { MysqlSlowParser } from '../parsers/mysqlSlow'
import { MysqldParser } from '../parsers/mysqld'
import {
  appendAccessRow,
  appendNginxErrorAggRow,
  appendPhpErrorRow,
  appendFpmEventRow,
  appendPhpSlowRow,
  appendMysqlSlowRow,
  appendDbEventRow
} from './appenders'
import type { LineParser } from '../parsers/types'

export const ingestEvents = new EventEmitter()

const MAX_ERRORS = 200

export interface IngestStatus {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  filesTotal: number
  filesDone: number
  filesSkipped: number
  currentFile: string | null
  currentFileBytesTotal: number
  currentFileBytesDone: number
  errors: string[]
}

let status: IngestStatus = {
  running: false,
  startedAt: null,
  finishedAt: null,
  filesTotal: 0,
  filesDone: 0,
  filesSkipped: 0,
  currentFile: null,
  currentFileBytesTotal: 0,
  currentFileBytesDone: 0,
  errors: []
}

export function getIngestStatus(): IngestStatus {
  return { ...status, errors: [...status.errors] }
}

function emitProgress() {
  ingestEvents.emit('progress', getIngestStatus())
}

interface ParserSpec {
  table: string
  createParser: () => LineParser<any>
  appendRow: (appender: DuckDBAppender, row: any, serverId: number, fileId: number) => void
}

const PARSER_REGISTRY: Partial<Record<LogType, ParserSpec>> = {
  nginx_access: { table: 'access_log', createParser: () => new NginxAccessParser(), appendRow: appendAccessRow },
  nginx_error: { table: 'nginx_error_agg', createParser: () => new NginxErrorParser(), appendRow: appendNginxErrorAggRow },
  php_error: { table: 'php_error', createParser: () => new PhpErrorParser(), appendRow: appendPhpErrorRow },
  php_fpm_error: { table: 'fpm_events', createParser: () => new PhpFpmParser(), appendRow: appendFpmEventRow },
  php_slow: { table: 'php_slow', createParser: () => new PhpSlowParser(), appendRow: appendPhpSlowRow },
  mysqld_slow: { table: 'mysql_slow', createParser: () => new MysqlSlowParser(), appendRow: appendMysqlSlowRow },
  mysqld: { table: 'db_events', createParser: () => new MysqldParser(), appendRow: appendDbEventRow }
}

interface FilePlan {
  fileId: number
  startOffset: number
  needsIngest: boolean
}

async function planFile(conn: DuckDBConnection, file: DiscoveredFile, serverId: number): Promise<FilePlan> {
  const headHash = computeHeadHash(file.absPath)
  const existing = await getFileRecord(conn, file.absPath)

  if (!existing) {
    const fileId = await insertFileRecord(conn, serverId, file, headHash)
    return { fileId, startOffset: 0, needsIngest: file.size > 0 }
  }

  const { fileId } = existing

  if (file.classified.mutable) {
    const rotated = (existing.headHash !== null && headHash !== existing.headHash) || file.size < existing.byteOffset
    if (rotated) {
      await resetFileForRotation(conn, fileId, file.classified.logType)
      await updateFileMeta(conn, fileId, file.size, file.mtime, headHash)
      return { fileId, startOffset: 0, needsIngest: file.size > 0 }
    }
    await updateFileMeta(conn, fileId, file.size, file.mtime, headHash)
    return { fileId, startOffset: existing.byteOffset, needsIngest: file.size > existing.byteOffset }
  }

  // Immutable (rotated/dated or .gz) file: once done, never revisit. If not done
  // (never started, or interrupted mid-run), wipe any partial rows and redo from scratch.
  if (existing.status === 'done') {
    return { fileId, startOffset: 0, needsIngest: false }
  }
  const table = tableForLogType(file.classified.logType)
  if (table) await conn.run(`DELETE FROM ${table} WHERE file_id = $fileId`, { fileId })
  return { fileId, startOffset: 0, needsIngest: file.size > 0 }
}

async function ingestFile(
  conn: DuckDBConnection,
  file: DiscoveredFile,
  serverId: number,
  fileId: number,
  startOffset: number,
  spec: ParserSpec
): Promise<void> {
  const source = openLineSource(file.absPath, file.classified.compressed, startOffset)
  const appender = await conn.createAppender(spec.table)
  const parser = spec.createParser()

  let linesIngested = 0
  let batchCount = 0
  const BATCH_SIZE = 5000

  const flushBatch = () => {
    appender.flushSync()
    status.currentFileBytesDone = startOffset + source.getBytesRead()
    emitProgress()
  }

  try {
    for await (const line of source.lines) {
      const rows = parser.feedLine(line)
      for (const row of rows) {
        spec.appendRow(appender, row, serverId, fileId)
        linesIngested++
        batchCount++
        if (batchCount >= BATCH_SIZE) {
          batchCount = 0
          flushBatch()
        }
      }
    }
    for (const row of parser.flush()) {
      spec.appendRow(appender, row, serverId, fileId)
      linesIngested++
    }
    appender.flushSync()
  } finally {
    appender.closeSync()
  }

  const parseErrors = typeof (parser as any).getErrorCount === 'function' ? (parser as any).getErrorCount() : 0
  const newOffset = file.classified.compressed ? file.size : startOffset + source.getBytesRead()

  await updateFileProgress(conn, fileId, { byteOffset: newOffset, linesIngested, parseErrors, status: 'done' })
}

/** Discovers all configured log directories and ingests anything new/changed. Serialized: only one run at a time. */
export async function runIngest(rootsOverride?: string[]): Promise<IngestStatus> {
  if (status.running) return getIngestStatus()

  const roots = rootsOverride ?? [getLogIngressDir()]
  const discovered = discoverRoots(roots)

  status = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    filesTotal: discovered.length,
    filesDone: 0,
    filesSkipped: 0,
    currentFile: null,
    currentFileBytesTotal: 0,
    currentFileBytesDone: 0,
    errors: []
  }
  emitProgress()

  try {
    for (const file of discovered) {
      await withLogWrite(async (conn) => {
        const siteId = await getOrCreateSite(conn, file.site, join(file.root, file.site))
        const serverId = await getOrCreateServer(conn, siteId, file.env, file.ip, file.role)
        const plan = await planFile(conn, file, serverId)

        const spec = PARSER_REGISTRY[file.classified.logType]
        if (!spec || !plan.needsIngest) {
          status.filesSkipped++
          status.filesDone++
          emitProgress()
          return
        }

        status.currentFile = file.absPath
        status.currentFileBytesTotal = file.size
        status.currentFileBytesDone = plan.startOffset
        emitProgress()

        await conn.run(`UPDATE ingest_files SET status = 'running' WHERE file_id = $fileId`, { fileId: plan.fileId })

        try {
          await ingestFile(conn, file, serverId, plan.fileId, plan.startOffset, spec)
        } catch (err: any) {
          const message = err?.message ?? String(err)
          await updateFileProgress(conn, plan.fileId, {
            byteOffset: plan.startOffset,
            linesIngested: 0,
            parseErrors: 0,
            status: 'error',
            lastError: message
          })
          if (status.errors.length < MAX_ERRORS) status.errors.push(`${file.absPath}: ${message}`)
        }

        status.filesDone++
        status.currentFile = null
        emitProgress()
      })

      // Recycling the connection between files bounds native/off-heap memory that would
      // otherwise accumulate across a long multi-file run (large ingests otherwise OOM).
      await recycleLogWriteConnection()
    }
  } finally {
    status.running = false
    status.finishedAt = new Date().toISOString()
    emitProgress()
    // These enrichment caches only earn their keep during ingestion; don't let the web
    // server carry them for the rest of its lifetime.
    clearGeoCache()
    clearUaCache()
    invalidateSitesCache()
  }

  // Runs after the status is marked finished so a slow alert pass can't make an ingest look
  // like it is still going. Imported lazily to keep the SQLite side out of this module's graph.
  const { runLogAlerts } = await import('../alerts')
  await runLogAlerts()

  return getIngestStatus()
}
