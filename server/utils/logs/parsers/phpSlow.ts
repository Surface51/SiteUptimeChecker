import type { LineParser, PhpSlowRow } from './types'
import { parsePhpTimestamp } from './dates'
import { hashFingerprint } from '../fingerprint/stack'

// "[10-Aug-2026 14:33:56]  [pool www] pid 8" — note the double space before the pool bracket.
const HEADER_RE = /^\[(\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2})\]\s+\[pool (\w+)\] pid (\d+)$/
const SCRIPT_RE = /^script_filename = (.*)$/
const FRAME_RE = /^\[0x[0-9a-f]+\] (\S+) (.+):(\d+)$/

interface PendingRecord {
  tsRaw: string
  pool: string
  pid: number
  script: string | null
  frames: string[]
}

/** Streams php-slow.log: blank-line-separated blocks of header + script_filename + stack frames. */
export class PhpSlowParser implements LineParser<PhpSlowRow> {
  private errorCount = 0
  private pending: PendingRecord | null = null

  feedLine(line: string): PhpSlowRow[] {
    const header = HEADER_RE.exec(line)
    if (header) {
      const finished = this.pending ? [this.finalize(this.pending)] : []
      this.pending = { tsRaw: header[1]!, pool: header[2]!, pid: Number(header[3]), script: null, frames: [] }
      return finished
    }

    if (!line.trim()) {
      // blank line: boundary, but don't finalize here — a new header (or EOF) does that,
      // which lets us tolerate the leading blank line at the very start of the file
      return []
    }

    if (!this.pending) {
      this.errorCount++
      return []
    }

    const script = SCRIPT_RE.exec(line)
    if (script) {
      this.pending.script = script[1] || null
      return []
    }

    this.pending.frames.push(line.trim())
    return []
  }

  flush(): PhpSlowRow[] {
    const rows = this.pending ? [this.finalize(this.pending)] : []
    this.pending = null
    return rows
  }

  getErrorCount(): number {
    return this.errorCount
  }

  private finalize(pending: PendingRecord): PhpSlowRow {
    const ts = parsePhpTimestamp(pending.tsRaw) ?? new Date(0)
    const fingerprintParts = pending.frames.map((f) => {
      const m = FRAME_RE.exec(f)
      return m ? `${m[1]} ${m[2]}:${m[3]}` : f
    })

    return {
      ts,
      pool: pending.pool,
      pid: pending.pid,
      script: pending.script,
      stack: pending.frames.join('\n'),
      fingerprint: hashFingerprint(fingerprintParts)
    }
  }
}
