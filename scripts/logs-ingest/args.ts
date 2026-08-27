import { availableParallelism, totalmem } from 'node:os'

export interface CliOptions {
  jobs: number
  /** DuckDB memory_limit for the main (merge) connection, e.g. '6GB'. */
  memory: string
  /** DuckDB memory_limit per worker. */
  workerMemory: string
  /** DuckDB threads for the main connection. */
  threads: number
  sites: string[]
  force: boolean
  stealLock: boolean
  dryRun: boolean
  keepTemp: boolean
  noServer: boolean
  progress: boolean | 'auto'
  url: string
  help: boolean
}

function pctToBytes(spec: string, total: number): number {
  const m = /^(\d+(?:\.\d+)?)%$/.exec(spec.trim())
  if (m) return Math.floor((Number(m[1]) / 100) * total)
  const g = /^(\d+(?:\.\d+)?)\s*(gb|g|mb|m)$/i.exec(spec.trim())
  if (g) {
    const n = Number(g[1])
    return /g/i.test(g[2]!) ? Math.floor(n * 2 ** 30) : Math.floor(n * 2 ** 20)
  }
  return NaN
}

function bytesToDuckSize(bytes: number): string {
  return `${Math.max(256, Math.floor(bytes / 2 ** 20))}MB`
}

export function parseArgs(argv: string[]): CliOptions {
  const cores = Math.max(1, availableParallelism())
  const opts: CliOptions = {
    jobs: Math.max(1, cores - 1),
    memory: '',
    workerMemory: '',
    threads: cores,
    sites: [],
    force: false,
    stealLock: false,
    dryRun: false,
    keepTemp: false,
    noServer: false,
    progress: 'auto',
    url: process.env.UPTIME_URL || 'http://localhost:3000',
    help: false,
  }

  let memorySpec = process.env.UPTIME_INGEST_MEMORY || '70%'
  let workerMemorySpec = ''

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const next = () => argv[++i]
    switch (arg) {
      case '-h':
      case '--help': opts.help = true; break
      case '--jobs': opts.jobs = Math.max(1, Number(next())); break
      case '--memory': memorySpec = String(next()); break
      case '--worker-memory': workerMemorySpec = String(next()); break
      case '--threads': opts.threads = Math.max(1, Number(next())); break
      case '--site': opts.sites.push(String(next())); break
      case '--force': opts.force = true; break
      case '--steal-lock': opts.stealLock = true; break
      case '--dry-run': opts.dryRun = true; break
      case '--keep-temp': opts.keepTemp = true; break
      case '--no-server': opts.noServer = true; break
      case '--no-progress': opts.progress = false; break
      case '--url': opts.url = String(next()); break
      default:
        throw new Error(`Unknown flag: ${arg}`)
    }
  }

  const total = totalmem()
  const budget = pctToBytes(memorySpec, total)
  if (Number.isNaN(budget) || budget <= 0) throw new Error(`Bad --memory: ${memorySpec}`)

  // Main gets ~60% of the budget (the merge INSERT..SELECT and CHECKPOINT are the heavy
  // ops); workers split the rest, floored at 256MB each.
  opts.memory = bytesToDuckSize(Math.floor(budget * 0.6))
  opts.workerMemory = workerMemorySpec
    ? bytesToDuckSize(pctToBytes(workerMemorySpec, total))
    : bytesToDuckSize(Math.floor((budget * 0.4) / opts.jobs))

  return opts
}

export const HELP = `
logs:ingest — parallel, resource-unbounded re-ingest of log-ingress/

Usage: npm run logs:ingest -- [flags]

  --jobs <n>          worker threads (default: cores - 1)
  --memory <n%|nGB>   total DuckDB memory budget (default: 70%, or $UPTIME_INGEST_MEMORY)
  --worker-memory <>  override per-worker DuckDB memory_limit
  --threads <n>       DuckDB threads for the merge connection (default: cores)
  --site <slug>       restrict to one folder (repeatable)
  --force            abort a server-side ingest in flight during the handoff
  --steal-lock       break a lock held by a LIVE process (can corrupt the DB — last resort)
  --dry-run          discover + plan, print the schedule, write nothing
  --keep-temp        leave .data/ingest-tmp/ scratch databases in place
  --no-server        skip the detach/attach handshake (fails if a server holds the lock)
  --no-progress      plain line output instead of the live TTY display
  --url <url>        server base URL for the handoff (default: $UPTIME_URL or :3000)

Log alerts are left to the server's next scheduled ingest tick.
`
