import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { classifyFilename } from '../../server/utils/logs/discovery'
import { localNameFor } from './rotateName'
import type { SshTarget, SyncJob } from './planTargets'

const execFileAsync = promisify(execFile)

export interface RemoteEntry {
  name: string
  size: number
  mtime: Date
}

export interface Transfer {
  /** Remote basename, relative to the pull root. */
  name: string
  /** Local filename to end up with in the destination server dir. */
  localName: string
  size: number
}

export interface JobPlan {
  transfers: Transfer[]
  /** localName → the remote names that both want it. Non-empty means the path entry is skipped. */
  collisions: Map<string, string[]>
  skipped: number
}

function expandTilde(p: string): string {
  return p.startsWith('~/') ? join(homedir(), p.slice(2)) : p
}

/** The `-e` value for rsync. rsync word-splits this on spaces, so no path with spaces. */
export function sshCommand(ssh: SshTarget): string {
  const parts = ['ssh']
  if (ssh.port && ssh.port !== 22) parts.push('-p', String(ssh.port))
  if (ssh.identityFile) parts.push('-i', expandTilde(ssh.identityFile))
  parts.push('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15')
  if (ssh.verifyHostKey) {
    parts.push('-o', 'StrictHostKeyChecking=accept-new')
  } else {
    // Pantheon container IPs are ephemeral and recycled — pinning host keys yields constant
    // false mismatches.
    parts.push('-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'LogLevel=ERROR')
  }
  return parts.join(' ')
}

const LIST_LINE =
  /^([bcdlps-][rwxsStT-]{9})\s+([\d,]+)\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(.+)$/

/** Parses `rsync --list-only` output (fixed-width `perms size date time name`, size with
 * thousands separators). Directories, symlinks and `.`/`..` are dropped. Pure. */
export function parseRsyncList(stdout: string): RemoteEntry[] {
  const out: RemoteEntry[] = []
  for (const line of stdout.split('\n')) {
    const m = LIST_LINE.exec(line.trimEnd())
    if (!m) continue
    if (m[1]![0] !== '-') continue // regular files only
    const name = m[5]!.split('/').pop()!
    if (name === '.' || name === '..' || name === '') continue
    out.push({
      name,
      size: Number(m[2]!.replace(/,/g, '')),
      mtime: new Date(`${m[3]!.replace(/\//g, '-')}T${m[4]}`),
    })
  }
  return out
}

/** Remote path (relative to the SSH login dir, or absolute) for the `--list-only` pass. */
function listPath(job: SyncJob): string {
  return job.kind === 'dir' ? `${job.remote.replace(/\/$/, '')}/` : job.remote
}

/** The directory the pull's `--files-from` basenames are resolved against. */
function pullRoot(job: SyncJob): string {
  if (job.kind === 'dir') return `${job.remote.replace(/\/$/, '')}/`
  return `${dirname(job.remote)}/`
}

/** The `[user@]host:path` argument for rsync. A bare host (no `user`) lets ssh / an
 *  `~/.ssh/config` alias supply the login name. */
export function target(job: SyncJob, path: string): string {
  const prefix = job.ssh.user ? `${job.ssh.user}@` : ''
  return `${prefix}${job.ssh.host}:${path}`
}

export async function listRemote(job: SyncJob): Promise<RemoteEntry[]> {
  const args = ['--list-only']
  if (job.kind === 'dir') args.push('-d')
  args.push('-e', sshCommand(job.ssh), target(job, listPath(job)))
  const { stdout } = await execFileAsync('rsync', args, { maxBuffer: 16 * 1024 * 1024 })
  return parseRsyncList(stdout)
}

/**
 * Decides which of the listed remote files to actually pull. Pure given `localSize`.
 *  - 'dir' jobs keep the remote name; anything it can't classify is skipped (count only).
 *  - 'glob'/'file' jobs rename via `as` + rotateName; two remotes → one local name is a
 *    collision and disqualifies the whole path entry (never a silent overwrite).
 *  - an immutable file already present locally at the same size is skipped.
 *  - with `maxAgeDays`, immutable files older than the cutoff are skipped; live files always kept.
 */
export function planJob(
  job: SyncJob,
  entries: RemoteEntry[],
  opts: { maxAgeDays?: number; now: Date; localSize: (localName: string) => number | null },
): JobPlan {
  const cutoff = opts.maxAgeDays ? opts.now.getTime() - opts.maxAgeDays * 86_400_000 : null
  const wanted = new Map<string, { remote: string; size: number }>()
  const collisions = new Map<string, string[]>()
  let skipped = 0

  for (const e of entries) {
    let localName: string
    if (job.kind === 'dir') {
      localName = e.name
    } else {
      localName = localNameFor(job.as!, e.name, e.mtime, job.rotated ?? true)
    }

    const classified = classifyFilename(localName)
    if (!classified || classified.logType === 'unknown') {
      skipped++
      continue
    }
    const immutable = !classified.mutable

    if (immutable && cutoff !== null && e.mtime.getTime() < cutoff) {
      skipped++
      continue
    }
    if (immutable) {
      const have = opts.localSize(localName)
      if (have !== null && have === e.size) {
        skipped++
        continue
      }
    }

    const prior = wanted.get(localName)
    if (prior && prior.remote !== e.name) {
      const list = collisions.get(localName) ?? [prior.remote]
      list.push(e.name)
      collisions.set(localName, list)
      continue
    }
    wanted.set(localName, { remote: e.name, size: e.size })
  }

  if (collisions.size > 0) {
    return { transfers: [], collisions, skipped }
  }
  const transfers: Transfer[] = [...wanted.entries()].map(([localName, v]) => ({
    localName,
    name: v.remote,
    size: v.size,
  }))
  return { transfers, collisions, skipped }
}

/**
 * Runs the actual transfer for one job's selected files. Files whose local name matches the
 * remote basename go straight into the destination (so rsync's delta check works across runs);
 * renamed ones stage through `<destDir>/.sync-tmp/` and are `renameSync`d into place, so a
 * half-transferred file is never visible to the ingester. Never `--partial`/`--inplace`.
 */
export async function pullJob(job: SyncJob, transfers: Transfer[]): Promise<void> {
  if (transfers.length === 0) return
  mkdirSync(job.destDir, { recursive: true })

  const direct = transfers.filter((t) => t.localName === t.name)
  const staged = transfers.filter((t) => t.localName !== t.name)
  const ssh = sshCommand(job.ssh)
  const root = pullRoot(job)
  const scratch = mkdtempSync(join(tmpdir(), 'logs-sync-'))

  try {
    if (direct.length > 0) {
      const ff = join(scratch, 'direct.txt')
      writeFileSync(ff, direct.map((t) => t.name).join('\n') + '\n')
      await execFileAsync('rsync', [
        '-ltz', '--size-only', `--files-from=${ff}`, '-e', ssh,
        target(job, root), `${job.destDir}/`,
      ])
    }

    if (staged.length > 0) {
      const tmpDir = join(job.destDir, '.sync-tmp')
      mkdirSync(tmpDir, { recursive: true })
      const ff = join(scratch, 'staged.txt')
      writeFileSync(ff, staged.map((t) => t.name).join('\n') + '\n')
      await execFileAsync('rsync', [
        '-ltz', '--size-only', `--files-from=${ff}`, '-e', ssh,
        target(job, root), `${tmpDir}/`,
      ])
      for (const t of staged) {
        renameSync(join(tmpDir, t.name), join(job.destDir, t.localName))
      }
      rmSync(tmpDir, { recursive: true, force: true })
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** statSync size or null — the injectable `localSize` for {@link planJob}. */
export function localSizeOf(destDir: string, localName: string): number | null {
  try {
    return statSync(join(destDir, localName)).size
  } catch {
    return null
  }
}
