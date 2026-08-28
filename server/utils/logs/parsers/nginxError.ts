import type { LineParser, NginxErrorAggRow } from './types'
import { parseNginxErrorTimestamp } from './dates'
import { ErrorAggregator } from './errorAgg'

const LINE_RE = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] \d+#\d+: (?:\*\d+ )?(.*)$/
// The trailing ", client: ..., server: ..., request: \"...\"[, upstream: \"...\"][, host: \"...\"][, referrer: \"...\"]"
// tail has an optional, variable-order set of fields — parse it generically as key: value pairs
// rather than a single rigid regex (upstream/referrer aren't always present, order isn't fixed).
const KV_RE = /(\w+): ("(?:[^"\\]|\\.)*"|[^,]*)/g

function parseTail(rest: string): { message: string; fields: Record<string, string> } {
  const splitIdx = rest.indexOf(', client: ')
  if (splitIdx === -1) return { message: rest, fields: {} }

  const message = rest.slice(0, splitIdx)
  const tail = rest.slice(splitIdx + 2) // drop leading ", " so tail starts at "client: ..."
  const fields: Record<string, string> = {}
  KV_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = KV_RE.exec(tail))) {
    const key = m[1]!
    let value = m[2]!
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    fields[key] = value.trim()
  }
  return { message, fields }
}

/** Aggregates nginx error lines into per-minute/level/fingerprint counts as they stream in,
 * since a single alert (e.g. "worker_connections are not enough") can repeat millions of times.
 * The bucketing itself lives in the shared {@link ErrorAggregator}. */
export class NginxErrorParser implements LineParser<NginxErrorAggRow> {
  private errorCount = 0
  private agg = new ErrorAggregator()

  feedLine(line: string): NginxErrorAggRow[] {
    if (!line) return []
    const m = LINE_RE.exec(line)
    if (!m) {
      this.errorCount++
      return []
    }

    const tsRaw = m[1]!, level = m[2]!, rest = m[3]!
    const ts = parseNginxErrorTimestamp(tsRaw)
    if (!ts) {
      this.errorCount++
      return []
    }

    const { message, fields } = parseTail(rest)
    return this.agg.add({
      ts,
      level,
      message,
      sampleRequest: fields.request || null,
      sampleHost: fields.host || null,
    })
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
