import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyFilename } from '../../server/utils/logs/discovery'
import { isGlob } from './rotateName'

export interface PantheonConfig {
  enabled: boolean
  env: string
  /** Plan labels to skip, case-insensitive. Default: ["Sandbox"]. Frozen sites are always skipped. */
  excludePlans: string[]
  /** If non-empty, only these Pantheon site names (or their aliased folder names) are synced. */
  include: string[]
  exclude: string[]
  /** Pantheon site name → log-ingress folder name. Default folder is the site name verbatim. */
  alias: Record<string, string>
  /** Also pull the dbserver container's mysqld logs. */
  includeDb: boolean
}

export interface ServerPath {
  /** Absolute remote path, or a glob (`*`, `?`, `[`), of the file(s) to pull. */
  remote: string
  /** Canonical local base name — MUST classify under server/utils/logs/discovery.ts. */
  as: string
  /** Treat matches as rotated archives (append a date to `as`). Defaults to true for a glob. */
  rotated?: boolean
}

export interface ServerSource {
  host: string
  user: string
  port: number
  identityFile?: string
  /** The <server> directory name under log-ingress/<folder>/<env>/. Defaults to `host`. */
  serverDir: string
  paths: ServerPath[]
}

export interface ServerEntry {
  env: string
  sources: ServerSource[]
}

export interface SyncConfig {
  pantheon: PantheonConfig | null
  /** log-ingress folder name → its custom servers. */
  servers: Record<string, ServerEntry>
}

export function configPath(cliValue?: string): string {
  const raw = cliValue || process.env.UPTIME_LOG_SYNC_CONFIG || './log-sync.config.json'
  return resolve(raw)
}

class ConfigError extends Error {}

function asStringArray(v: unknown, where: string): string[] {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new ConfigError(`${where} must be an array of strings`)
  }
  return v as string[]
}

function validatePathEntry(p: unknown, where: string): ServerPath {
  if (!p || typeof p !== 'object') throw new ConfigError(`${where} must be an object`)
  const { remote, as, rotated } = p as Record<string, unknown>
  if (typeof remote !== 'string' || !remote) throw new ConfigError(`${where}.remote is required`)
  if (typeof as !== 'string' || !as) throw new ConfigError(`${where}.as is required`)
  if (rotated !== undefined && typeof rotated !== 'boolean') {
    throw new ConfigError(`${where}.rotated must be a boolean`)
  }

  // Fail fast on a name the ingester would silently ignore.
  const classified = classifyFilename(as)
  if (!classified || classified.logType === 'unknown') {
    throw new ConfigError(
      `${where}.as = ${JSON.stringify(as)} is not a recognised log filename ` +
        `(see server/utils/logs/discovery.ts — e.g. "apache-access.log", "apache-error.log")`,
    )
  }
  const isRotated = rotated ?? isGlob(remote)
  if (isRotated && !classified.mutable) {
    throw new ConfigError(
      `${where}.as = ${JSON.stringify(as)} already carries a date suffix but the entry is ` +
        `rotated — use the base name (e.g. "apache-access.log"); the date is appended for you`,
    )
  }
  return { remote, as, rotated }
}

function validateSource(s: unknown, where: string): ServerSource {
  if (!s || typeof s !== 'object') throw new ConfigError(`${where} must be an object`)
  const src = s as Record<string, unknown>
  if (typeof src.host !== 'string' || !src.host) throw new ConfigError(`${where}.host is required`)
  if (typeof src.user !== 'string' || !src.user) throw new ConfigError(`${where}.user is required`)
  if (src.port !== undefined && (typeof src.port !== 'number' || !Number.isInteger(src.port))) {
    throw new ConfigError(`${where}.port must be an integer`)
  }
  if (src.identityFile !== undefined && typeof src.identityFile !== 'string') {
    throw new ConfigError(`${where}.identityFile must be a string`)
  }
  if (src.serverDir !== undefined && typeof src.serverDir !== 'string') {
    throw new ConfigError(`${where}.serverDir must be a string`)
  }
  if (!Array.isArray(src.paths) || src.paths.length === 0) {
    throw new ConfigError(`${where}.paths must be a non-empty array`)
  }
  return {
    host: src.host,
    user: src.user,
    port: (src.port as number) ?? 22,
    identityFile: src.identityFile as string | undefined,
    serverDir: (src.serverDir as string) || src.host,
    paths: src.paths.map((p, i) => validatePathEntry(p, `${where}.paths[${i}]`)),
  }
}

function validatePantheon(v: unknown): PantheonConfig {
  const p = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  if (p.enabled !== undefined && typeof p.enabled !== 'boolean') {
    throw new ConfigError('pantheon.enabled must be a boolean')
  }
  if (p.includeDb !== undefined && typeof p.includeDb !== 'boolean') {
    throw new ConfigError('pantheon.includeDb must be a boolean')
  }
  const alias: Record<string, string> = {}
  if (p.alias !== undefined) {
    if (!p.alias || typeof p.alias !== 'object' || Array.isArray(p.alias)) {
      throw new ConfigError('pantheon.alias must be an object of name → folder')
    }
    for (const [k, val] of Object.entries(p.alias as Record<string, unknown>)) {
      if (typeof val !== 'string' || !val) throw new ConfigError(`pantheon.alias.${k} must be a non-empty string`)
      alias[k] = val
    }
  }
  return {
    enabled: (p.enabled as boolean) ?? true,
    env: typeof p.env === 'string' && p.env ? p.env : 'live',
    excludePlans: p.excludePlans === undefined ? ['Sandbox'] : asStringArray(p.excludePlans, 'pantheon.excludePlans'),
    include: asStringArray(p.include, 'pantheon.include'),
    exclude: asStringArray(p.exclude, 'pantheon.exclude'),
    alias,
    includeDb: (p.includeDb as boolean) ?? true,
  }
}

/** Reads and fully validates the sync config. Throws a plain Error with a one-line reason on any
 * problem — the CLI turns that into exit code 2. */
export function loadConfig(path: string): SyncConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      throw new ConfigError(`no config at ${path} — copy log-sync.config.example.json to get started`)
    }
    throw new ConfigError(`${path}: ${err.message}`)
  }
  if (!parsed || typeof parsed !== 'object') throw new ConfigError(`${path}: top level must be an object`)
  const root = parsed as Record<string, unknown>

  const servers: Record<string, ServerEntry> = {}
  if (root.servers !== undefined) {
    if (!root.servers || typeof root.servers !== 'object' || Array.isArray(root.servers)) {
      throw new ConfigError('servers must be an object of folder → { env, sources }')
    }
    for (const [name, entry] of Object.entries(root.servers as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') throw new ConfigError(`servers.${name} must be an object`)
      const e = entry as Record<string, unknown>
      if (!Array.isArray(e.sources) || e.sources.length === 0) {
        throw new ConfigError(`servers.${name}.sources must be a non-empty array`)
      }
      servers[name] = {
        env: typeof e.env === 'string' && e.env ? e.env : 'live',
        sources: e.sources.map((s, i) => validateSource(s, `servers.${name}.sources[${i}]`)),
      }
    }
  }

  return {
    pantheon: root.pantheon === undefined ? null : validatePantheon(root.pantheon),
    servers,
  }
}
