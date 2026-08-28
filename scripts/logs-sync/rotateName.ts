// Pure helpers for turning a remote log filename into the local name the ingester expects.
// The whole point: a file the sync writes must satisfy classifyFilename() in
// server/utils/logs/discovery.ts, or it is invisible to ingestion forever.

const GLOB_CHARS = /[*?[\]]/

/** A `remote` path with a shell glob metacharacter expands to several files; without one it's
 * a single file. Drives the default for a path entry's `rotated` flag. */
export function isGlob(remote: string): boolean {
  return GLOB_CHARS.test(remote)
}

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** YYYYMMDD (UTC) for a Date — the fallback when a remote basename carries no parseable date. */
export function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}

/** Pulls a rotation date out of a remote basename. Recognises YYYYMMDD, YYYY-MM-DD / YYYY.MM.DD,
 * and cPanel's "Mon-YYYY" archive names (→ the 1st of that month). Returns YYYYMMDD or null. */
export function extractDate(basename: string): string | null {
  let m = basename.match(/(20\d{2})[-.](\d{2})[-.](\d{2})/)
  if (m) return `${m[1]}${m[2]}${m[3]}`

  m = basename.match(/(?:^|[^0-9])(20\d{2})(\d{2})(\d{2})(?:[^0-9]|$)/)
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31) {
    return `${m[1]}${m[2]}${m[3]}`
  }

  m = basename.match(/\b([A-Z][a-z]{2})-(20\d{2})\b/)
  if (m && MONTHS[m[1]!]) return `${m[2]}${MONTHS[m[1]!]}01`

  return null
}

/**
 * The local filename for one fetched remote file.
 *  - not rotated → `as`, verbatim (the canonical live name).
 *  - rotated     → `<as without trailing .gz>-<YYYYMMDD>[.gz]`, the date taken from the remote
 *                  basename when it has one, otherwise from the remote mtime; `.gz` kept only
 *                  when the remote file is itself gzipped.
 */
export function localNameFor(
  as: string,
  remoteBasename: string,
  mtime: Date,
  rotated: boolean,
): string {
  if (!rotated) return as
  const stem = as.endsWith('.gz') ? as.slice(0, -3) : as
  const date = extractDate(remoteBasename) ?? ymd(mtime)
  const gz = remoteBasename.endsWith('.gz') ? '.gz' : ''
  return `${stem}-${date}${gz}`
}
