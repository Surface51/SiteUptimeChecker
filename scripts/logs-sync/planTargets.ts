import { join } from 'node:path'
import type { PantheonConfig, ServerEntry, SyncConfig } from './config'
import type { PantheonSite } from './pantheon'
import { appserverIps, dbserverIps, pantheonSshUser } from './pantheon'
import { isGlob } from './rotateName'

export interface SshTarget {
  /** Hostname/IP or an ~/.ssh/config `Host` alias. */
  host: string
  /** Omitted → no `user@` in the rsync target; ssh/the alias supplies the login name. */
  user?: string
  /** Omitted → no `-p`; ssh's default (22) or the alias's `Port` applies. */
  port?: number
  identityFile?: string
  /** false → StrictHostKeyChecking=no + UserKnownHostsFile=/dev/null (ephemeral Pantheon IPs);
   *  true  → StrictHostKeyChecking=accept-new against the real known_hosts (custom servers). */
  verifyHostKey: boolean
}

export interface SyncJob {
  /** Stable one-line label for logs/progress. */
  key: string
  origin: 'pantheon' | 'server'
  /** log-ingress folder name. */
  folder: string
  env: string
  /** The <server> directory name under the env. */
  serverDir: string
  /** Absolute destination directory: <ingress>/<folder>/<env>/<serverDir>. */
  destDir: string
  ssh: SshTarget
  /** 'dir' keeps remote filenames; 'glob'/'file' rename via `as` + rotateName. */
  kind: 'dir' | 'glob' | 'file'
  /** Remote path as given: a directory (no trailing slash needed), a glob, or a single file. */
  remote: string
  /** Present for kind 'glob' | 'file'. */
  as?: string
  rotated?: boolean
}

/**
 * The Pantheon sites to sync, as [site, folder] pairs. Pure — no network, no disk.
 * Order: drop frozen; drop excludePlans (case-insensitive); apply include (empty = all) then
 * exclude; apply the CLI --site filter (matches the Pantheon name OR the aliased folder); drop
 * folders the operator has paused; resolve folder = alias[name] ?? name.
 */
export function selectPantheonSites(
  sites: PantheonSite[],
  cfg: PantheonConfig,
  cliSites: string[],
  pausedFolders: Set<string>,
): { site: PantheonSite; folder: string }[] {
  const exclude = new Set(cfg.excludePlans.map((p) => p.toLowerCase()))
  const includeSet = cfg.include.length ? new Set(cfg.include) : null
  const excludeNames = new Set(cfg.exclude)
  const cli = cliSites.length ? new Set(cliSites) : null

  const out: { site: PantheonSite; folder: string }[] = []
  for (const site of sites) {
    if (site.frozen) continue
    if (exclude.has(site.plan_name.toLowerCase())) continue
    if (includeSet && !includeSet.has(site.name)) continue
    if (excludeNames.has(site.name)) continue
    const folder = cfg.alias[site.name] ?? site.name
    if (cli && !cli.has(site.name) && !cli.has(folder)) continue
    if (pausedFolders.has(folder)) continue
    out.push({ site, folder })
  }
  return out
}

/** Builds the transfer jobs for the selected Pantheon sites. Does the DNS lookups. */
export async function buildPantheonJobs(
  selected: { site: PantheonSite; folder: string }[],
  cfg: PantheonConfig,
  ingressDir: string,
  warn: (msg: string) => void,
): Promise<SyncJob[]> {
  const jobs: SyncJob[] = []
  for (const { site, folder } of selected) {
    const user = pantheonSshUser(cfg.env, site.id)
    const [appIps, dbIps] = await Promise.all([
      appserverIps(cfg.env, site.id),
      cfg.includeDb ? dbserverIps(cfg.env, site.id) : Promise.resolve([]),
    ])
    if (appIps.length === 0) {
      warn(`${site.name}: no appserver.${cfg.env} DNS — env not deployed, skipping`)
      continue
    }
    const ssh = (host: string): SshTarget => ({ host, user, port: 2222, verifyHostKey: false })

    for (const ip of appIps) {
      const destDir = join(ingressDir, folder, cfg.env, ip)
      // Remote appserver layout is nested (logs/nginx, logs/php); local is flat — pull both
      // into the same server dir. Filenames don't collide.
      jobs.push({
        key: `${folder}/${cfg.env}/${ip} nginx/`,
        origin: 'pantheon', folder, env: cfg.env, serverDir: ip, destDir, ssh: ssh(ip),
        kind: 'dir', remote: 'logs/nginx',
      })
      jobs.push({
        key: `${folder}/${cfg.env}/${ip} php/`,
        origin: 'pantheon', folder, env: cfg.env, serverDir: ip, destDir, ssh: ssh(ip),
        kind: 'dir', remote: 'logs/php',
      })
    }
    for (const ip of dbIps) {
      jobs.push({
        key: `${folder}/${cfg.env}/${ip} db logs/`,
        origin: 'pantheon', folder, env: cfg.env, serverDir: ip,
        destDir: join(ingressDir, folder, cfg.env, ip), ssh: ssh(ip),
        kind: 'dir', remote: 'logs',
      })
    }
  }
  return jobs
}

/** Builds the transfer jobs for the custom `servers` map. Pure. */
export function buildServerJobs(
  servers: Record<string, ServerEntry>,
  ingressDir: string,
  cliSites: string[],
): SyncJob[] {
  const cli = cliSites.length ? new Set(cliSites) : null
  const jobs: SyncJob[] = []
  for (const [folder, entry] of Object.entries(servers)) {
    if (cli && !cli.has(folder)) continue
    for (const src of entry.sources) {
      const destDir = join(ingressDir, folder, entry.env, src.serverDir)
      const ssh: SshTarget = {
        host: src.host, user: src.user, port: src.port,
        identityFile: src.identityFile, verifyHostKey: true,
      }
      // src.user / src.port are optional: an ~/.ssh/config alias fills them in.
      for (const p of src.paths) {
        const kind: SyncJob['kind'] = isGlob(p.remote) ? 'glob' : 'file'
        jobs.push({
          key: `${folder}/${entry.env}/${src.serverDir} ${p.as}`,
          origin: 'server', folder, env: entry.env, serverDir: src.serverDir, destDir, ssh,
          kind, remote: p.remote, as: p.as,
          rotated: p.rotated ?? isGlob(p.remote),
        })
      }
    }
  }
  return jobs
}
