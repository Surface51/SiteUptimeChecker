import { EventEmitter } from 'node:events'
import { readSync, openSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import type { DuckDBConnection } from '@duckdb/node-api'
import type { IngestStatus } from '#shared/types'
import { discoverRoots, type DiscoveredFile } from '../discovery'
import { getLogIngressDir } from '../config'
import { withLogWrite, recycleLogWriteConnection } from '../logDb'
import { clearGeoCache } from '../enrich/geo'
import { clearUaCache } from '../enrich/ua'
import { invalidateSitesCache } from '../sitesCache'
import { getOrCreateSite, getOrCreateServer, updateFileProgress } from './state'
import { openLineSource } from './stream'
import { planFile } from './plan'
import { PARSER_REGISTRY, type ParserSpec } from './registry'
import { getExternalIngestStatus } from '../dbLease'

export const ingestEvents = new EventEmitter()
export type { IngestStatus }

const MAX_ERRORS = 200

function emptyStatus(): IngestStatus {
  return {
    running: false,
    stopRequested: false,
    stoppedReason: null,
    source: 'server',
    startedAt: null,
    finishedAt: null,
    filesTotal: 0,
    filesDone: 0,
    filesSkipped: 0,
    currentFile: null,
    currentFileBytesTotal: 0,
    currentFileBytesDone: 0,
    errors: [],
  }
}

let status: IngestStatus = emptyStatus()

/** The in-flight run, so a caller (e.g. the DB-detach endpoint) can await it winding down. */
let currentRun: Promise<IngestStatus> | null = null

export function getIngestStatus(): IngestStatus {
  // While the database is handed off to the CLI, the CLI's relayed status is the live one.
  const external = getExternalIngestStatus()
  if (external) return { ...external, errors: [...external.errors] }
  return { ...status, errors: [...status.errors] }
}

/** The promise of the run in progress, or null if idle. */
export function getCurrentIngestRun(): Promise<IngestStatus> | null {
  return currentRun
}

/**
 * Asks the running ingest to wind down at the next parser-safe boundary. 'stop' is an
 * operator action; 'detach' is the CLI taking the database. No-op if nothing is running.
 */
export function requestIngestStop(reason: 'stop' | 'detach' = 'stop'): IngestStatus {
  if (status.running && !status.stopRequested) {
    status.stopRequested = true
    status.stoppedReason = reason
    emitProgress()
  }
  return getIngestStatus()
}

function emitProgress() {
  ingestEvents.emit('progress', getIngestStatus())
}

/** Whether the file's final on-disk byte is a newline — used to decide if a live file's
 * trailing (still-being-appended) line is complete enough to ingest this run. */
function endsWithNewline(absPath: string, size: number): boolean {
  if (size === 0) return true
  const fd = openSync(absPath, 'r')
  try {
    const buf = Buffer.alloc(1)
    readSync(fd, buf, 0, 1, size - 1)
    return buf[0] === 0x0a
  } finally {
    closeSync(fd)
  }
}

type IngestOutcome = 'done' | 'stopped'

async function ingestFile(
  conn: DuckDBConnection,
  file: DiscoveredFile,
  serverId: number,
  fileId: number,
  startOffset: number,
  spec: ParserSpec,
): Promise<IngestOutcome> {
  const source = openLineSource(file.absPath, file.classified.compressed, startOffset)
  const appender = await conn.createAppender(spec.table)
  const parser = spec.createParser()

  const resumable = !file.classified.compressed
  // A live file's last line may still be mid-write. If the file doesn't end in a newline,
  // hold that final line back rather than feeding a torn half-line and advancing the offset
  // past it (which would lose the line once it's completed).
  const holdBackFinalLine = file.classified.mutable && !file.classified.compressed
    ? !endsWithNewline(file.absPath, file.size)
    : false

  let linesIngested = 0
  let checkpointedLines = 0
  let batchCount = 0
  // Rows per appender flush / checkpoint. Overridable only so tests can exercise the
  // mid-file checkpoint and stop paths without multi-thousand-line fixtures.
  const BATCH_SIZE = Number(process.env.UPTIME_LOG_INGEST_BATCH) || 5000

  // Byte offset (relative to startOffset) of lines already *fed* to the parser.
  let consumed = 0
  // The furthest offset from which a fresh parser could resume without dropping or
  // duplicating a row: end of the last fully-emitted line, or the start of the line that
  // opened the parser's current pending record/bucket.
  let safeOffset = 0
  let lastCheckpointOffset = 0

  const checkpoint = async (finalStatus: 'running' | 'stopped') => {
    appender.flushSync()
    if (resumable && (safeOffset > lastCheckpointOffset || finalStatus === 'stopped')) {
      await updateFileProgress(conn, fileId, {
        byteOffset: startOffset + safeOffset,
        linesIngested: linesIngested - checkpointedLines,
        parseErrors: 0,
        status: finalStatus,
      })
      lastCheckpointOffset = safeOffset
      checkpointedLines = linesIngested
    }
    status.currentFileBytesDone = startOffset + source.getBytesRead()
    emitProgress()
  }

  let hadPendingBefore = false
  const feed = (line: string) => {
    const lineStart = consumed
    const rows = parser.feedLine(line)
    consumed += Buffer.byteLength(line, 'utf8') + 1

    const hasPending = parser.hasPendingState?.() ?? false
    if (!hasPending) {
      // Nothing held back — everything up to here has been emitted.
      safeOffset = consumed
    } else if (rows.length > 0 || !hadPendingBefore) {
      // This line opened the parser's current pending record/bucket — either by finalizing
      // the previous one (rows.length > 0) or by starting from nothing. A resume must
      // re-enter here so a fresh parser rebuilds that pending state.
      safeOffset = lineStart
    }
    // else: pending state carried over from an earlier line — leave safeOffset alone.
    hadPendingBefore = hasPending

    for (const row of rows) {
      spec.appendRow(appender, row, serverId, fileId)
      linesIngested++
      batchCount++
    }
  }

  let stopped = false
  try {
    let held: string | null = null
    for await (const line of source.lines) {
      if (holdBackFinalLine) {
        if (held !== null) feed(held)
        held = line
      } else {
        feed(line)
      }

      if (batchCount >= BATCH_SIZE) {
        batchCount = 0
        await checkpoint('running')
      }

      if (status.stopRequested) {
        stopped = true
        break
      }
    }

    if (!stopped) {
      if (held !== null) feed(held)
      for (const row of parser.flush()) {
        spec.appendRow(appender, row, serverId, fileId)
        linesIngested++
      }
      appender.flushSync()
    } else {
      // Do NOT flush the parser: its pending record starts at safeOffset and will be
      // re-read on resume. Just persist what's already emitted.
      await checkpoint('stopped')
    }
  } finally {
    appender.closeSync()
  }

  const parseErrors = typeof (parser as any).getErrorCount === 'function' ? (parser as any).getErrorCount() : 0

  if (stopped) {
    if (!resumable) {
      // Compressed: can't resume mid-stream. Leave the offset alone; planFile wipes and
      // restarts this file next run.
      await updateFileProgress(conn, fileId, {
        byteOffset: startOffset,
        linesIngested: 0,
        parseErrors: 0,
        status: 'stopped',
      })
    }
    return 'stopped'
  }

  const newOffset = file.classified.compressed ? file.size : startOffset + source.getBytesRead()
  await updateFileProgress(conn, fileId, {
    byteOffset: newOffset,
    linesIngested: linesIngested - checkpointedLines,
    parseErrors,
    status: 'done',
  })
  return 'done'
}

export interface RunIngestOptions {
  /** Restrict this run to these folder slugs (still subject to the paused check). */
  onlySlugs?: string[]
}

/** Discovers all configured log directories and ingests anything new/changed. Serialized: only one run at a time. */
export async function runIngest(rootsOverride?: string[], opts: RunIngestOptions = {}): Promise<IngestStatus> {
  if (status.running) return getIngestStatus()

  const run = doRunIngest(rootsOverride, opts)
  currentRun = run
  try {
    return await run
  } finally {
    currentRun = null
  }
}

async function doRunIngest(rootsOverride: string[] | undefined, opts: RunIngestOptions): Promise<IngestStatus> {
  const roots = rootsOverride ?? [getLogIngressDir()]

  // Skip folders an operator has paused. Imported lazily to keep the SQLite side out of this
  // module's static graph (same reasoning as the alerts import below).
  const { pausedLogFolders } = await import('../../db')
  const paused = pausedLogFolders()
  const only = opts.onlySlugs ? new Set(opts.onlySlugs) : null
  const discovered = discoverRoots(roots).filter(
    (f) => !paused.has(f.site) && (!only || only.has(f.site)),
  )

  status = {
    ...emptyStatus(),
    running: true,
    startedAt: new Date().toISOString(),
    filesTotal: discovered.length,
  }
  emitProgress()

  let stopped = false
  try {
    for (const file of discovered) {
      if (status.stopRequested) {
        stopped = true
        break
      }

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
          const outcome = await ingestFile(conn, file, serverId, plan.fileId, plan.startOffset, spec)
          if (outcome === 'stopped') stopped = true
        } catch (err: any) {
          const message = err?.message ?? String(err)
          await updateFileProgress(conn, plan.fileId, {
            byteOffset: plan.startOffset,
            linesIngested: 0,
            parseErrors: 0,
            status: 'error',
            lastError: message,
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

      if (stopped) break
    }
  } finally {
    status.running = false
    status.stopRequested = false
    status.finishedAt = new Date().toISOString()
    emitProgress()
    // These enrichment caches only earn their keep during ingestion; don't let the web
    // server carry them for the rest of its lifetime.
    clearGeoCache()
    clearUaCache()
    invalidateSitesCache()
  }

  // A stopped run skips the alert pass — its data is partial and half the point of stopping
  // is to not spend more time in this subsystem right now.
  if (!stopped) {
    const { runLogAlerts } = await import('../alerts')
    await runLogAlerts()
  }

  return getIngestStatus()
}
