import type { AccessRow, LineParser } from './types'
import { parseNginxAccessTimestamp } from './dates'
import { normalizeUrl } from '../enrich/urlNormalize'
import { enrichUserAgent } from '../enrich/ua'
import { lookupCountry } from '../enrich/geo'

// Handles Apache's stock formats, with or without a leading vhost token and a trailing time:
//   common          %h %l %u [%t] "%r" %>s %b
//   combined        %h %l %u [%t] "%r" %>s %b "%{Referer}i" "%{User-Agent}i"
//   vhost_combined  %v:%p %h %l %u [%t] "%r" ...
//   + optional trailing %D (integer µs) or %T (fractional s)
//
// The optional first group is the vhost: the `\[` anchor after exactly three more tokens is what
// tells 3 pre-bracket tokens (%h %l %u) apart from 4 (%v %h %l %u), so a plain combined line and
// a vhost_combined line both parse without a second regex. Quoted fields allow `\"` because
// mod_log_config escapes `"` and `\` inside %r and the header fields.
const LINE_RE =
  /^(?:(\S+) )?(\S+) (\S+) (\S+) \[([^\]]+)\] "((?:[^"\\]|\\.)*)" (\d{3}) (\d+|-)(?: "((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)")?(?: (\d+(?:\.\d+)?|-))?\s*$/

const REQUEST_RE = /^(\S+) (.*) (HTTP\/[0-9.]+)$/

export class ApacheAccessParser implements LineParser<AccessRow> {
  private errorCount = 0

  feedLine(line: string): AccessRow[] {
    if (!line) return []
    const m = LINE_RE.exec(line)
    if (!m) {
      this.errorCount++
      return []
    }

    const clientIp = m[2]!
    const tsRaw = m[5]!
    const requestRaw = m[6]!
    const statusRaw = m[7]!
    const bytesRaw = m[8]!
    const referer = m[9] ?? ''
    const userAgent = m[10] ?? ''
    const durationRaw = m[11]

    const ts = parseNginxAccessTimestamp(tsRaw)
    if (!ts) {
      this.errorCount++
      return []
    }

    // A malformed request line ("\x16\x03\x01…" TLS-on-plaintext probes, a bare "-") still
    // carries the 4xx traffic the security views exist for — keep the row, don't count it as a
    // parse error. Method "-" and path "-" mark it.
    const req = REQUEST_RE.exec(requestRaw)
    const method = req ? req[1]! : '-'
    const rawUrl = req ? req[2]! : requestRaw
    const { path, hasQuery, pathPattern } = req
      ? normalizeUrl(rawUrl)
      : { path: '-', hasQuery: false, pathPattern: '-' }

    const ua = enrichUserAgent(userAgent)
    const country = lookupCountry(clientIp)

    // Apache logs no X-Forwarded-For field; %h is whatever connected — the real client on a
    // direct server, the proxy/CDN address otherwise (unless mod_remoteip rewrites it upstream).
    const row: AccessRow = {
      ts,
      clientIp,
      method,
      url: rawUrl,
      path,
      pathPattern,
      hasQuery,
      status: Number(statusRaw),
      bytes: bytesRaw === '-' ? 0 : Number(bytesRaw),
      referer,
      userAgent,
      duration: parseDuration(durationRaw),
      uaBrowser: ua.browser,
      uaOs: ua.os,
      uaDevice: ua.device,
      isBot: ua.isBot,
      botName: ua.botName,
      country,
    }

    return [row]
  }

  flush(): AccessRow[] {
    return []
  }

  getErrorCount(): number {
    return this.errorCount
  }
}

// The one ambiguous field in the format: an integer is read as %D (microseconds), a value with a
// decimal point as %T (seconds). Absent or "-" → null. A bare `%T` in whole seconds would be
// misread as microseconds, but timing-augmented Apache configs almost always use %D.
function parseDuration(raw: string | undefined): number | null {
  if (!raw || raw === '-') return null
  return raw.includes('.') ? Number(raw) : Number(raw) / 1_000_000
}
