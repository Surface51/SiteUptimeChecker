/** Formatters for log analytics. Counts here run to millions, so tables and tiles need
 * compact forms; the exact value stays available in tooltips and CSV exports. */

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  const n = Number(value)
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`
}

export function formatExact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString()
}

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  let n = Number(value)
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unit = 0
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024
    unit++
  }
  return `${n < 10 && unit > 0 ? n.toFixed(1) : Math.round(n)} ${units[unit]}`
}

/** Access-log durations are in seconds; sub-second values read better as milliseconds. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return '—'
  const s = Number(seconds)
  if (s < 1) return `${Math.round(s * 1000)} ms`
  if (s < 60) return `${s.toFixed(2)} s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${Number(value).toFixed(digits)}%`
}

/** DuckDB timestamps arrive as ISO strings with an explicit Z, unlike the SQLite side. */
export function formatLogTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export function logTimeMs(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : Number.NaN
}

/** Tone for an HTTP status, matching the status tokens used across the app. */
export function statusTone(status: number): 'up' | 'maint' | 'degraded' | 'down' {
  if (status < 300) return 'up'
  if (status < 400) return 'maint'
  if (status < 500) return 'degraded'
  return 'down'
}
