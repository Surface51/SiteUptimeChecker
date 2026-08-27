import { readdirSync, statSync, type Dirent } from 'node:fs'
import { join } from 'node:path'

export type LogType =
  | 'nginx_access'
  | 'nginx_error'
  | 'php_error'
  | 'php_fpm_error'
  | 'php_slow'
  | 'mysqld_slow'
  | 'mysqld'
  | 'unknown'

export interface ClassifiedFilename {
  logType: LogType
  rotatedDate: string | null // YYYY-MM-DD
  compressed: boolean
  mutable: boolean
}

// Matches: base name, optional "-YYYYMMDD" rotation suffix, optional ".gz",
// optional trailing " <epoch>" (php-error/php-fpm-error rotate with a space + unix epoch).
const FILENAME_RE =
  /^(?<base>nginx-access\.log|nginx-error\.log|php-error\.log|php-fpm-error\.log|php-slow\.log|mysqld-slow-query\.log|mysqld\.log|error\.log)(?:-(?<date>\d{8}))?(?:\.gz)?(?: (?<epoch>\d+))?$/

const BASE_TO_TYPE: Record<string, LogType> = {
  'nginx-access.log': 'nginx_access',
  'nginx-error.log': 'nginx_error',
  'error.log': 'nginx_error',
  'php-error.log': 'php_error',
  'php-fpm-error.log': 'php_fpm_error',
  'php-slow.log': 'php_slow',
  'mysqld-slow-query.log': 'mysqld_slow',
  'mysqld.log': 'mysqld'
}

export function classifyFilename(filename: string): ClassifiedFilename | null {
  const match = FILENAME_RE.exec(filename)
  if (!match || !match.groups) return null

  const { base, date } = match.groups
  const logType = (base ? BASE_TO_TYPE[base] : undefined) ?? 'unknown'
  const compressed = filename.endsWith('.gz')
  const mutable = !date // no rotation date suffix => this is the live, growing file

  let rotatedDate: string | null = null
  if (date) {
    rotatedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
  }

  return { logType, rotatedDate, compressed, mutable }
}

export interface DiscoveredFile {
  root: string
  site: string
  env: string
  ip: string
  role: 'app' | 'db'
  absPath: string
  filename: string
  classified: ClassifiedFilename
  size: number
  mtime: Date
}

function isIpLike(name: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(name) || name.includes(':') // v4 dotted or v6-ish
}

// A Dirent for a symlink reports neither isDirectory() nor isFile(), so both listings below
// resolve symlinks explicitly: the ingress directory is meant to be populated by linking log
// directories that live elsewhere on the box, not only by copying them in. statSync follows
// the link and throws on a broken one, which is treated as "not a match".
function resolvesToType(path: string, type: 'dir' | 'file'): boolean {
  try {
    const stat = statSync(path)
    return type === 'dir' ? stat.isDirectory() : stat.isFile()
  } catch {
    return false
  }
}

function listEntries(path: string, type: 'dir' | 'file'): string[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(path, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((d) => (type === 'dir' ? d.isDirectory() : d.isFile())
      || (d.isSymbolicLink() && resolvesToType(join(path, d.name), type)))
    .map((d) => d.name)
}

/** Walks root/<site>/<env>/<server-ip>/<logfile> and returns every recognized log file. */
export function discoverRoot(root: string): DiscoveredFile[] {
  const out: DiscoveredFile[] = []

  for (const site of listEntries(root, 'dir')) {
    const sitePath = join(root, site)

    for (const env of listEntries(sitePath, 'dir')) {
      const envPath = join(sitePath, env)

      for (const ip of listEntries(envPath, 'dir')) {
        if (!isIpLike(ip)) continue
        const serverPath = join(envPath, ip)
        const files = listEntries(serverPath, 'file')

        const role: 'app' | 'db' = files.some((f) => f.startsWith('mysqld')) ? 'db' : 'app'

        for (const filename of files) {
          const classified = classifyFilename(filename)
          if (!classified) continue
          const absPath = join(serverPath, filename)
          const stat = statSync(absPath)
          out.push({
            root,
            site,
            env,
            ip,
            role,
            absPath,
            filename,
            classified,
            size: stat.size,
            mtime: stat.mtime
          })
        }
      }
    }
  }

  return out
}

export function discoverRoots(roots: string[]): DiscoveredFile[] {
  return roots.flatMap(discoverRoot)
}
