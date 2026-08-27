import type { LineParser, NginxErrorAggRow } from './types'
import { parseNginxErrorTimestamp } from './dates'
import { fingerprintMessage } from '../fingerprint/message'

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

interface AggEntry {
  bucket: Date
  level: string
  fingerprint: string
  count: number
  sampleMessage: string
  sampleRequest: string | null
  sampleHost: string | null
}

/** Aggregates nginx error lines into per-minute/level/fingerprint counts as they stream in,
 * since a single alert (e.g. "worker_connections are not enough") can repeat millions of times. */
export class NginxErrorParser implements LineParser<NginxErrorAggRow> {
  private errorCount = 0
  private currentBucketMs: number | null = null
  private bucketMap = new Map<string, AggEntry>()

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
    const sampleRequest = fields.request || null
    const sampleHost = fields.host || null

    const fingerprint = fingerprintMessage(message)
    const bucketMs = Math.floor(ts.getTime() / 60_000) * 60_000

    let flushed: NginxErrorAggRow[] = []
    if (this.currentBucketMs !== null && bucketMs !== this.currentBucketMs) {
      flushed = this.drain()
    }
    this.currentBucketMs = bucketMs

    const key = `${level}|${fingerprint}`
    const existing = this.bucketMap.get(key)
    if (existing) {
      existing.count++
    } else {
      this.bucketMap.set(key, {
        bucket: new Date(bucketMs),
        level,
        fingerprint,
        count: 1,
        sampleMessage: message,
        sampleRequest,
        sampleHost
      })
    }

    return flushed
  }

  flush(): NginxErrorAggRow[] {
    return this.drain()
  }

  hasPendingState(): boolean {
    return this.bucketMap.size > 0
  }

  private drain(): NginxErrorAggRow[] {
    const rows = Array.from(this.bucketMap.values())
    this.bucketMap.clear()
    return rows
  }

  getErrorCount(): number {
    return this.errorCount
  }
}
