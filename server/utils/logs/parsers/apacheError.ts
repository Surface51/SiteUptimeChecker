import type { LineParser, NginxErrorAggRow } from './types'
import { parseApacheErrorTimestamp } from './dates'
import { ErrorAggregator } from './errorAgg'

// Apache 2.4:  [Wed Aug 27 10:00:00.123456 2026] [core:error] [pid 1234:tid 5678] [client 1.2.3.4:5678] AH00124: msg
// Apache 2.2:  [Wed Aug 27 10:00:00 2026] [error] [client 1.2.3.4] msg
// First bracket = timestamp, second = "module:level" (2.4) or bare "level" (2.2); any further
// leading bracket groups (pid, client) sit between that and the message text.
const HEAD_RE = /^\[([^\]]+)\] \[([^\]]+)\] (.*)$/
const LEADING_BRACKETS_RE = /^(?:\[[^\]]*\]\s*)+/
// A trailing ", referer: <url>" — no column for it, and it would explode fingerprint cardinality.
const TRAILING_REFERER_RE = /,\s*referer:\s*\S+\s*$/i

/** Aggregates Apache error lines into per-minute/level/fingerprint counts, exactly like the
 * nginx error parser — same {@link ErrorAggregator}, same target table (`nginx_error_agg`). */
export class ApacheErrorParser implements LineParser<NginxErrorAggRow> {
  private errorCount = 0
  private agg = new ErrorAggregator()

  feedLine(line: string): NginxErrorAggRow[] {
    if (!line) return []
    const m = HEAD_RE.exec(line)
    if (!m) {
      this.errorCount++
      return []
    }

    const ts = parseApacheErrorTimestamp(m[1]!)
    if (!ts) {
      this.errorCount++
      return []
    }

    const tag = m[2]!
    const colon = tag.indexOf(':')
    const module = colon === -1 ? null : tag.slice(0, colon)
    const level = (colon === -1 ? tag : tag.slice(colon + 1)).trim()

    let message = m[3]!
      .replace(LEADING_BRACKETS_RE, '')
      .replace(TRAILING_REFERER_RE, '')
      .trim()
    // Keep e.g. core:error and php:error in separate fingerprint groups.
    if (module) message = `[${module}] ${message}`

    return this.agg.add({ ts, level, message })
  }

  flush(): NginxErrorAggRow[] {
    return this.agg.flush()
  }

  hasPendingState(): boolean {
    return this.agg.hasPending()
  }

  getErrorCount(): number {
    return this.errorCount
  }
}
