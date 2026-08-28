import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pausedLogFolders } from '../../server/utils/db'
import { getLogIngressDir } from '../../server/utils/logs/config'
import { HELP, parseArgs } from './args'
import { configPath, loadConfig } from './config'
import { listPantheonSites, terminusBin } from './pantheon'
import { buildPantheonJobs, buildServerJobs, selectPantheonSites, type SyncJob } from './planTargets'
import { mapPool } from './pool'
import { Progress } from './progress'
import { listRemote, localSizeOf, planJob, pullJob } from './rsync'

function fmtBytes(n: number): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)}${u[i]}`
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(HELP)
    return 0
  }

  const ingressDir = getLogIngressDir()
  const warnings: string[] = []
  const warn = (msg: string) => { warnings.push(msg); console.error(`⚠ ${msg}`) }

  // --- Config ---
  let config
  try {
    config = loadConfig(configPath(opts.config))
  } catch (err: any) {
    console.error(`✗ config: ${err.message}`)
    return 2
  }

  // --- Build the job list ---
  const jobs: SyncJob[] = []

  const doPantheon = !opts.onlyServers && config.pantheon?.enabled
  if (doPantheon) {
    let sites
    try {
      sites = await listPantheonSites(terminusBin(opts.terminus))
    } catch (err: any) {
      console.error(`✗ ${err.message}`)
      return 2
    }
    const selected = selectPantheonSites(sites, config.pantheon!, opts.sites, pausedLogFolders())
    console.log(`→ Pantheon: ${selected.length} site(s) selected of ${sites.length}`)
    jobs.push(...(await buildPantheonJobs(selected, config.pantheon!, ingressDir, warn)))
  }

  const doServers = !opts.onlyPantheon
  if (doServers && Object.keys(config.servers).length > 0) {
    const serverJobs = buildServerJobs(config.servers, ingressDir, opts.sites)
    console.log(`→ Servers: ${serverJobs.length} transfer(s) from ${Object.keys(config.servers).length} folder(s)`)
    jobs.push(...serverJobs)
  }

  if (jobs.length === 0) {
    console.log('Nothing to sync.')
    return warnings.length ? 1 : 0
  }

  const now = new Date()
  const maxAgeDays = opts.maxAgeDays || undefined

  // --- Dry run ---
  if (opts.dryRun) {
    let failed = 0
    let totalFiles = 0
    let totalBytes = 0
    for (const job of jobs) {
      try {
        const entries = await listRemote(job)
        const plan = planJob(job, entries, {
          maxAgeDays, now, localSize: (n) => localSizeOf(job.destDir, n),
        })
        if (plan.collisions.size > 0) {
          for (const [local, remotes] of plan.collisions) {
            console.error(`✗ ${job.key}: ${remotes.join(', ')} all map to ${local} — fix the config`)
          }
          failed++
          continue
        }
        totalFiles += plan.transfers.length
        totalBytes += plan.transfers.reduce((s, t) => s + t.size, 0)
        const detail = plan.transfers.length
          ? plan.transfers.map((t) => `${t.localName} (${fmtBytes(t.size)})`).join(', ')
          : `nothing new${plan.skipped ? ` (${plan.skipped} skipped)` : ''}`
        console.log(`  ${job.key}\n      ${detail}`)
      } catch (err: any) {
        console.error(`✗ ${job.key}: ${err.message.split('\n')[0]}`)
        failed++
      }
    }
    console.log(`\n${jobs.length} job(s): ${totalFiles} file(s), ${fmtBytes(totalBytes)} would transfer` +
      `${failed ? `, ${failed} failed to list` : ''}`)
    return failed ? 1 : 0
  }

  // --- Transfer ---
  const tty = opts.progress && !!process.stdout.isTTY
  const progress = new Progress({ tty, total: jobs.length })
  let aborting = false
  process.on('SIGINT', () => {
    if (aborting) process.exit(130)
    aborting = true
    console.error('\n→ finishing in-flight transfers (Ctrl-C again to abandon)')
  })

  const results = await mapPool(jobs, opts.jobs, async (job) => {
    if (aborting) throw new Error('aborted')
    progress.start(job.key)
    const entries = await listRemote(job)
    const plan = planJob(job, entries, {
      maxAgeDays, now, localSize: (n) => localSizeOf(job.destDir, n),
    })
    if (plan.collisions.size > 0) {
      const [local, remotes] = [...plan.collisions.entries()][0]!
      throw new Error(`${remotes.join(', ')} all map to ${local}`)
    }
    const bytes = plan.transfers.reduce((s, t) => s + t.size, 0)
    await pullJob(job, plan.transfers)
    progress.ok(job.key, plan.transfers.length, bytes, plan.skipped)
    return { transferred: plan.transfers.length, bytes }
  })

  let failed = 0
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      failed++
      progress.fail(jobs[i]!.key, String((r.reason as any)?.message ?? r.reason).split('\n')[0])
    }
  })
  progress.finish()

  let exitCode = failed ? 1 : 0

  // --- Optional chained ingest ---
  if (opts.thenIngest) {
    console.log('\n→ logs:ingest')
    const repo = process.cwd()
    const build = spawnSync('node', [join(repo, 'scripts/logs-ingest/build.mjs')], { stdio: 'inherit' })
    const run = build.status === 0
      ? spawnSync('node', [join(repo, '.output/logs-ingest/cli.js'), ...(opts.progress ? [] : ['--no-progress'])], { stdio: 'inherit' })
      : build
    if (run.status && run.status !== 0 && exitCode === 0) exitCode = run.status
  }

  return exitCode
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
