import { closeSync, mkdirSync, openSync, readSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { getDataDir, pausedLogFolders } from '../../server/utils/db'
import { getLogDbPath, getLogIngressDir } from '../../server/utils/logs/config'
import { acquireLogDbLockWithRetry } from '../../server/utils/logs/lock'
import { migrateLogDb } from '../../server/utils/logs/schema'
import { discoverRoots, type DiscoveredFile } from '../../server/utils/logs/discovery'
import { getOrCreateServer, getOrCreateSite, updateFileProgress } from '../../server/utils/logs/ingest/state'
import { planFile } from '../../server/utils/logs/ingest/plan'
import { PARSER_REGISTRY } from '../../server/utils/logs/ingest/registry'
import { HELP, parseArgs } from './args'
import { Progress } from './progress'
import { ServerHandoff } from './serverHandoff'
import { WorkerPool, type JobResult } from './pool'
import type { IngestJob } from './worker'

interface PlannedJob extends IngestJob {
  label: string
  /** Estimated bytes of log text to parse (gzip: uncompressed size), for scheduling + progress. */
  weight: number
}

/** gzip stores the uncompressed size mod 2^32 in the last 4 bytes (ISIZE). Exact for files
 * under 4 GB, which log rotations always are. */
function gzipUncompressedSize(path: string, onDiskSize: number): number {
  try {
    const fd = openSync(path, 'r')
    try {
      const buf = Buffer.alloc(4)
      readSync(fd, buf, 0, 4, Math.max(0, onDiskSize - 4))
      const isize = buf.readUInt32LE(0)
      return isize > 0 ? isize : onDiskSize * 4
    } finally {
      closeSync(fd)
    }
  } catch {
    return onDiskSize * 4
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(HELP)
    return 0
  }

  const tty = opts.progress === false ? false : !!process.stdout.isTTY
  const dbPath = getLogDbPath()
  const scratchDir = join(getDataDir(), 'ingest-tmp')
  const handoff = new ServerHandoff(opts.url, opts.noServer)

  // --- 1. Ask the running server (if any) to release the database ---
  let detached = false
  try {
    detached = await handoff.detach(opts.force)
  } catch (err: any) {
    console.error(`✗ server refused the handoff: ${err.message}`)
    console.error('  Re-run with --force to abort a server-side ingest in flight.')
    return 3
  }
  if (detached) console.log(`→ server released ${dbPath}`)
  else if (!opts.noServer) console.log(`→ no server at ${opts.url}, proceeding directly`)

  // --- 2. Take the lock ourselves ---
  let releaseLock: (() => void) | null = null
  try {
    releaseLock = await acquireLogDbLockWithRetry(dbPath, opts.stealLock ? 1 : 5)
  } catch (err: any) {
    if (opts.stealLock) {
      console.error('⚠ --steal-lock: breaking a lock held by a live process. This can corrupt the database.')
      rmSync(`${dbPath}.lock`, { force: true })
      releaseLock = await acquireLogDbLockWithRetry(dbPath, 1)
    } else {
      console.error(`✗ ${err.message}`)
      await handoff.attach()
      return 3
    }
  }

  rmSync(scratchDir, { recursive: true, force: true })
  mkdirSync(scratchDir, { recursive: true })

  // --- 3. Open our own DuckDB with the CLI's (much larger) ceilings ---
  const instance = await DuckDBInstance.create(dbPath, {
    memory_limit: opts.memory,
    threads: String(opts.threads),
    temp_directory: join(getDataDir(), 'tmp'),
    max_temp_directory_size: '64GB',
    preserve_insertion_order: 'false',
    allocator_background_threads: 'true',
  })
  let conn: DuckDBConnection = await instance.connect()
  await migrateLogDb(conn)

  const progress = new Progress({ tty })
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let exitCode = 0

  const cleanup = async () => {
    if (heartbeat) clearInterval(heartbeat)
    try { conn.closeSync() } catch { /* */ }
    try { instance.closeSync() } catch { /* */ }
    releaseLock?.()
    if (!opts.keepTemp) rmSync(scratchDir, { recursive: true, force: true })
    await handoff.attach().catch(() => {})
  }

  // Ctrl-C: stop scheduling new files, let in-flight workers finish, then clean up.
  let aborting = false
  const onSignal = () => {
    if (aborting) process.exit(130)
    aborting = true
    console.error('\n→ stopping after in-flight files finish (Ctrl-C again to abandon)')
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  try {
    // --- 4. Discover + plan (serially, on the main connection — IDs come from its sequences) ---
    const paused = pausedLogFolders()
    const onlySites = opts.sites.length ? new Set(opts.sites) : null
    const discovered = discoverRoots([getLogIngressDir()]).filter(
      (f) => !paused.has(f.site) && (!onlySites || onlySites.has(f.site)),
    )

    const jobs: PlannedJob[] = []
    let skipped = 0
    for (const file of discovered) {
      const siteId = await getOrCreateSite(conn, file.site, join(file.root, file.site))
      const serverId = await getOrCreateServer(conn, siteId, file.env, file.ip, file.role)
      const plan = await planFile(conn, file, serverId)
      const spec = PARSER_REGISTRY[file.classified.logType as keyof typeof PARSER_REGISTRY]
      if (!spec || !plan.needsIngest) {
        skipped++
        continue
      }
      jobs.push({
        fileId: plan.fileId,
        serverId,
        absPath: file.absPath,
        logType: file.classified.logType,
        compressed: file.classified.compressed,
        startOffset: plan.startOffset,
        size: file.size,
        label: shortLabel(file),
        weight: file.classified.compressed
          ? gzipUncompressedSize(file.absPath, file.size)
          : file.size - plan.startOffset,
      })
    }

    // Largest first — otherwise the one big file runs alone at the tail.
    jobs.sort((a, b) => b.weight - a.weight)

    if (opts.dryRun) {
      console.log(`\n${jobs.length} file(s) to ingest, ${skipped} unchanged:\n`)
      for (const j of jobs) {
        console.log(`  ${j.label.padEnd(60)} ${fmt(j.weight).padStart(9)}  offset ${j.startOffset}`)
      }
      console.log(`\n  jobs=${opts.jobs}  main mem=${opts.memory}  worker mem=${opts.workerMemory}`)
      return 0
    }

    if (!jobs.length) {
      console.log(`Nothing to ingest — ${skipped} file(s) already up to date.`)
      return 0
    }

    console.log(`Ingesting ${jobs.length} file(s) with ${opts.jobs} worker(s); ${skipped} unchanged.\n`)
    progress.init(jobs.map((j) => ({ fileId: j.fileId, label: j.label, size: j.size, weight: j.weight })))

    if (handoff.token) {
      void handoff.heartbeat(progress.snapshot()) // seed the UI immediately
      heartbeat = setInterval(() => void handoff.heartbeat(progress.snapshot()), 5_000)
      heartbeat.unref?.()
    }

    // --- 5. Run the pool; merge each finished scratch DB on the main connection ---
    const byId = new Map(jobs.map((j) => [j.fileId, j]))
    let mergeChain: Promise<void> = Promise.resolve()
    let recycleCounter = 0
    const failures: string[] = []

    const pool = new WorkerPool(Math.min(opts.jobs, jobs.length), { scratchDir, memoryLimit: opts.workerMemory }, {
      onProgress: (fileId, bytesRead) => progress.progress(fileId, bytesRead),
      onResult: (result: JobResult, job) => {
        // Serialize merges behind one another; parsing keeps running in parallel meanwhile.
        mergeChain = mergeChain.then(async () => {
          if (result.type === 'error') {
            failures.push(`${byId.get(job.fileId)?.label}: ${result.message}`)
            progress.error(job.fileId, result.message)
            await updateFileProgress(conn, job.fileId, {
              byteOffset: job.startOffset,
              linesIngested: 0,
              parseErrors: 0,
              status: 'error',
              lastError: result.message,
            })
            return
          }
          await mergeScratch(conn, result)
          rmSync(result.scratchPath, { force: true })
          rmSync(`${result.scratchPath}.wal`, { force: true })
          progress.done(job.fileId, result.linesIngested, result.parseErrors)

          if (++recycleCounter % 8 === 0) {
            conn.closeSync()
            conn = await instance.connect()
          }
        })
        return mergeChain
      },
    })

    const scheduled = aborting ? [] : jobs
    await pool.run(scheduled)
    await mergeChain
    await pool.close()

    await conn.run('CHECKPOINT')
    progress.finish()

    console.log(`\n✓ ${jobs.length - failures.length}/${jobs.length} file(s) ingested.`)
    if (failures.length) {
      exitCode = 1
      console.error(`\n${failures.length} failed:`)
      for (const f of failures) console.error(`  ${f}`)
    }
    console.log('  Log alerts will run on the server\'s next ingest tick.')
  } finally {
    await cleanup()
  }

  return exitCode
}

async function mergeScratch(
  conn: DuckDBConnection,
  r: Extract<JobResult, { type: 'done' }>,
) {
  const alias = `w_${r.fileId}_${Date.now().toString(36)}`
  await conn.run(`ATTACH '${r.scratchPath.replace(/'/g, "''")}' AS ${alias} (READ_ONLY)`)
  try {
    // Rows and the offset advance commit together — exactly-once per file at any interruption.
    await conn.run('BEGIN')
    await conn.run(`INSERT INTO ${r.table} SELECT * FROM ${alias}.${r.table}`)
    await conn.run(
      `UPDATE ingest_files
         SET byte_offset = $off, lines_ingested = lines_ingested + $lines,
             parse_errors = parse_errors + $errs, status = 'done', updated_at = now()
       WHERE file_id = $fileId`,
      { off: r.byteOffset, lines: r.linesIngested, errs: r.parseErrors, fileId: r.fileId },
    )
    await conn.run('COMMIT')
  } catch (err) {
    await conn.run('ROLLBACK').catch(() => {})
    throw err
  } finally {
    await conn.run(`DETACH ${alias}`).catch(() => {})
  }
}

function shortLabel(f: DiscoveredFile): string {
  return `${f.site}/${f.env}/${f.ip}/${f.filename}`
}
function fmt(n: number): string {
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)}${u[i]}`
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
