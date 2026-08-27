import { parentPort, workerData } from 'node:worker_threads'
import { join } from 'node:path'
import { DuckDBInstance } from '@duckdb/node-api'
import { migrateLogDb } from '../../server/utils/logs/schema'
import { openLineSource } from '../../server/utils/logs/ingest/stream'
import { PARSER_REGISTRY } from '../../server/utils/logs/ingest/registry'

export interface IngestJob {
  fileId: number
  serverId: number
  absPath: string
  logType: string
  compressed: boolean
  startOffset: number
  size: number
}

interface WorkerConfig {
  id: number
  scratchDir: string
  memoryLimit: string
}

const cfg = workerData as WorkerConfig
const port = parentPort!

const FLUSH_ROWS = 50_000
const PROGRESS_EVERY_MS = 250

async function handleJob(job: IngestJob) {
  const spec = PARSER_REGISTRY[job.logType as keyof typeof PARSER_REGISTRY]
  if (!spec) {
    port.postMessage({ type: 'error', fileId: job.fileId, message: `no parser for ${job.logType}` })
    return
  }

  const scratchPath = join(cfg.scratchDir, `w${cfg.id}-f${job.fileId}.duckdb`)
  const instance = await DuckDBInstance.create(scratchPath, {
    // A worker only ever appends — intra-query parallelism buys it nothing, and N workers at
    // the default (= core count) would spawn a storm of contending native threads.
    threads: '1',
    memory_limit: cfg.memoryLimit,
    preserve_insertion_order: 'false',
  })

  let linesIngested = 0
  let lastProgress = 0
  try {
    const conn = await instance.connect()
    await migrateLogDb(conn)

    const source = openLineSource(job.absPath, job.compressed, job.startOffset)
    const appender = await conn.createAppender(spec.table)
    const parser = spec.createParser()

    let batch = 0
    for await (const line of source.lines) {
      for (const row of parser.feedLine(line)) {
        spec.appendRow(appender, row, job.serverId, job.fileId)
        linesIngested++
        if (++batch >= FLUSH_ROWS) {
          batch = 0
          appender.flushSync()
        }
      }
      const now = Date.now()
      if (now - lastProgress > PROGRESS_EVERY_MS) {
        lastProgress = now
        port.postMessage({ type: 'progress', fileId: job.fileId, bytesRead: source.getBytesRead() })
      }
    }
    for (const row of parser.flush()) {
      spec.appendRow(appender, row, job.serverId, job.fileId)
      linesIngested++
    }
    appender.flushSync()
    appender.closeSync()

    conn.closeSync()
    instance.closeSync()

    const parseErrors =
      typeof (parser as any).getErrorCount === 'function' ? (parser as any).getErrorCount() : 0
    const byteOffset = job.compressed ? job.size : job.startOffset + source.getBytesRead()

    port.postMessage({
      type: 'done',
      fileId: job.fileId,
      scratchPath,
      table: spec.table,
      linesIngested,
      parseErrors,
      byteOffset,
    })
  } catch (err: any) {
    try { instance.closeSync() } catch { /* already closed */ }
    port.postMessage({ type: 'error', fileId: job.fileId, message: err?.message ?? String(err) })
  }
}

port.on('message', (msg: IngestJob | { type: 'shutdown' }) => {
  if ('type' in msg && msg.type === 'shutdown') {
    process.exit(0)
  }
  void handleJob(msg as IngestJob)
})

port.postMessage({ type: 'ready' })
