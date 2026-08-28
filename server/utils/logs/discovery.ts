import { readdirSync, statSync, type Dirent } from 'node:fs'
import { join } from 'node:path'

export type LogType =
  | 'nginx_access'
  | 'apache_access'
  | 'nginx_error'
  | 'apache_error'
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

// Matches: base name, optional "__tag" (lets one server dir hold several access logs — a plain
// domlog and an -ssl_log, or one per vhost — without filename collisions), ".log", optional
// "-YYYYMMDD" rotation suffix, optional ".gz", optional trailing " <epoch>" (php-error /
// php-fpm-error rotate with a space + unix epoch).
// "mysqld-slow-query" stays ahead of "mysqld" so the longer name wins without backtracking;
// "__" as the tag delimiter is what keeps "mysqld-slow-query.log" unambiguous ("-slow-query"
// is not "__…").
const FILENAME_RE =
  /^(?<base>nginx-access|apache-access|nginx-error|apache-error|php-error|php-fpm-error|php-slow|mysqld-slow-query|mysqld|error)(?<tag>__[A-Za-z0-9][A-Za-z0-9_]*)?\.log(?:-(?<date>\d{8}))?(?:\.gz)?(?: (?<epoch>\d+))?$/

const BASE_TO_TYPE: Record<string, LogType> = {
  'nginx-access': 'nginx_access',
  'apache-access': 'apache_access',
  'nginx-error': 'nginx_error',
  'apache-error': 'apache_error',
  'error': 'nginx_error',
  'php-error': 'php_error',
  'php-fpm-error': 'php_fpm_error',
  'php-slow': 'php_slow',
  'mysqld-slow-query': 'mysqld_slow',
  'mysqld': 'mysqld'
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

// A server directory is named by its address: an IPv4 dotted quad, something v6-ish, or a
// DNS-style hostname label (custom servers are often reached by name, not IP). A leading dot
// is rejected so "." / ".." / ".sync-tmp" never count. Wrong guesses here are harmless — a
// directory that passes but holds no recognised log file contributes nothing.
function isServerDirName(name: string): boolean {
  return (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(name) ||
    name.includes(':') ||
    /^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(name)
  )
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
        if (!isServerDirName(ip)) continue
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
