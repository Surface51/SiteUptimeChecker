import { availableParallelism } from 'node:os'

export interface SyncCliOptions {
  dryRun: boolean
  sites: string[]
  onlyPantheon: boolean
  onlyServers: boolean
  jobs: number
  /** Skip rotated/immutable files older than this many days. 0 = no age limit. */
  maxAgeDays: number
  thenIngest: boolean
  config?: string
  terminus?: string
  progress: boolean
  help: boolean
}

export function parseArgs(argv: string[]): SyncCliOptions {
  const cores = Math.max(1, availableParallelism())
  const opts: SyncCliOptions = {
    dryRun: false,
    sites: [],
    onlyPantheon: false,
    onlyServers: false,
    jobs: Math.min(6, cores),
    maxAgeDays: 0,
    thenIngest: false,
    progress: true,
    help: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const next = () => argv[++i]
    switch (arg) {
      case '-h':
      case '--help': opts.help = true; break
      case '--dry-run': opts.dryRun = true; break
      case '--site': opts.sites.push(String(next())); break
      case '--only-pantheon': opts.onlyPantheon = true; break
      case '--only-servers': opts.onlyServers = true; break
      case '--jobs': opts.jobs = Math.max(1, Number(next())); break
      case '--max-age-days': opts.maxAgeDays = Math.max(0, Number(next())); break
      case '--then-ingest': opts.thenIngest = true; break
      case '--config': opts.config = String(next()); break
      case '--terminus': opts.terminus = String(next()); break
      case '--no-progress': opts.progress = false; break
      default:
        throw new Error(`Unknown flag: ${arg}`)
    }
  }

  if (opts.onlyPantheon && opts.onlyServers) {
    throw new Error('--only-pantheon and --only-servers are mutually exclusive')
  }
  return opts
}

export const HELP = `
logs:sync — pull live logs from Pantheon and custom servers into log-ingress/

Usage: npm run logs:sync -- [flags]

  --dry-run           list every file that would transfer, write nothing
  --site <name>       restrict to one site/folder (repeatable; matches the Pantheon
                      site name or its aliased folder)
  --only-pantheon     skip the servers map
  --only-servers      skip Pantheon
  --jobs <n>          concurrent rsync transfers (default: min(6, cores))
  --max-age-days <n>  skip rotated archives older than n days (live files always synced)
  --then-ingest       run \`npm run logs:ingest\` afterwards
  --config <path>     config file (default: $UPTIME_LOG_SYNC_CONFIG or ./log-sync.config.json)
  --terminus <path>   terminus binary (default: $UPTIME_TERMINUS_BIN or "terminus")
  --no-progress       plain line output instead of the live display

Config: see log-sync.config.example.json. Exit codes: 0 ok, 1 some transfers failed,
2 config invalid / prerequisites missing.
`
