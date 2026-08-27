const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
}

const NGINX_ACCESS_TS = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/

/** Parses nginx's "24/Aug/2026:03:37:29 +0000" access-log timestamp into a UTC Date. */
export function parseNginxAccessTimestamp(raw: string): Date | null {
  const m = NGINX_ACCESS_TS.exec(raw)
  if (!m) return null
  const day = m[1]!, monAbbr = m[2]!, year = m[3]!, hh = m[4]!, mm = m[5]!, ss = m[6]!, offset = m[7]!
  const monthIdx = MONTHS[monAbbr]
  if (monthIdx === undefined) return null

  const offsetSign = offset[0] === '-' ? -1 : 1
  const offsetMinutes = offsetSign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5)))

  const utcMs = Date.UTC(Number(year), monthIdx, Number(day), Number(hh), Number(mm), Number(ss)) - offsetMinutes * 60_000
  return new Date(utcMs)
}

const NGINX_ERROR_TS = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

/** Parses nginx's "2026/08/23 03:38:03" error-log timestamp. Assumed UTC (server is UTC). */
export function parseNginxErrorTimestamp(raw: string): Date | null {
  const m = NGINX_ERROR_TS.exec(raw)
  if (!m) return null
  const year = m[1]!, month = m[2]!, day = m[3]!, hh = m[4]!, mm = m[5]!, ss = m[6]!
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hh), Number(mm), Number(ss)))
}

const PHP_LOG_TS = /^(\d{2})-(\w{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/

/** Parses PHP's "24-Aug-2026 09:37:47" timestamp (php-fpm, php-slow — always local/UTC, no zone). */
export function parsePhpTimestamp(raw: string): Date | null {
  const m = PHP_LOG_TS.exec(raw)
  if (!m) return null
  const day = m[1]!, monAbbr = m[2]!, year = m[3]!, hh = m[4]!, mm = m[5]!, ss = m[6]!
  const monthIdx = MONTHS[monAbbr]
  if (monthIdx === undefined) return null
  return new Date(Date.UTC(Number(year), monthIdx, Number(day), Number(hh), Number(mm), Number(ss)))
}

const MYSQLD_TS = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/

/** Parses mysqld.log's "2025-08-31  6:16:15" timestamp (variable-width hour). */
export function parseMysqldTimestamp(raw: string): Date | null {
  const m = MYSQLD_TS.exec(raw)
  if (!m) return null
  const year = m[1]!, month = m[2]!, day = m[3]!, hh = m[4]!, mm = m[5]!, ss = m[6]!
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hh), Number(mm), Number(ss)))
}
