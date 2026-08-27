import { DateTime } from 'luxon'
import type { LineParser, PhpErrorRow } from './types'
import { hashFingerprint } from '../fingerprint/stack'

// "[12-Aug-2026 08:51:03 UTC] <rest>" or "[12-Aug-2026 03:51:03 America/Chicago] <rest>"
const START_RE = /^\[(\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2}) ([\w/+-]+)\] (.*)$/
const FRAME_SPLIT_RE = /^(.*?) (#0 .*)$/
const SRC_LOCATION_RE = /(?:in|at) (\/\S+\.php)(?: on)? line (\d+)/
const FRAME_CALL_RE = /\): (.+)$/

interface PendingRecord {
  tsRaw: string
  zone: string
  message: string
  frames: string[]
}

export class PhpErrorParser implements LineParser<PhpErrorRow> {
  private errorCount = 0
  private pending: PendingRecord | null = null

  feedLine(line: string): PhpErrorRow[] {
    const m = START_RE.exec(line)
    if (m) {
      const finished = this.pending ? [this.finalize(this.pending)] : []
      const tsRaw = m[1]!, zone = m[2]!, rest = m[3]!

      const frameSplit = FRAME_SPLIT_RE.exec(rest)
      this.pending = frameSplit
        ? { tsRaw, zone, message: frameSplit[1]!, frames: [frameSplit[2]!] }
        : { tsRaw, zone, message: rest, frames: [] }

      return finished
    }

    if (this.pending && line.trim()) {
      this.pending.frames.push(line.trim())
    } else if (line.trim()) {
      this.errorCount++
    }

    return []
  }

  flush(): PhpErrorRow[] {
    if (!this.pending) return []
    const row = this.finalize(this.pending)
    this.pending = null
    return [row]
  }

  getErrorCount(): number {
    return this.errorCount
  }

  private finalize(pending: PendingRecord): PhpErrorRow {
    const ts = parsePhpErrorTimestamp(pending.tsRaw, pending.zone)
    const errorType = extractErrorType(pending.message)
    const location = SRC_LOCATION_RE.exec(pending.message)
    const srcFile = location ? location[1]! : null
    const srcLine = location ? Number(location[2]!) : null

    const topFrames = pending.frames.slice(0, 3).map((f) => {
      const call = FRAME_CALL_RE.exec(f)
      return call ? call[1]! : f
    })

    return {
      ts,
      errorType,
      message: pending.message,
      srcFile,
      srcLine,
      stack: pending.frames.join('\n'),
      fingerprint: hashFingerprint([errorType, srcFile, srcLine, ...topFrames])
    }
  }
}

function parsePhpErrorTimestamp(tsRaw: string, zone: string): Date {
  const dt = DateTime.fromFormat(tsRaw, 'dd-LLL-yyyy HH:mm:ss', { zone })
  if (dt.isValid) return dt.toUTC().toJSDate()
  // Unrecognized zone name — fall back to treating it as UTC rather than dropping the row.
  const fallback = DateTime.fromFormat(tsRaw, 'dd-LLL-yyyy HH:mm:ss', { zone: 'utc' })
  return fallback.isValid ? fallback.toJSDate() : new Date(0)
}

function extractErrorType(message: string): string {
  const uncaught = /^Uncaught PHP Exception (\S+):/.exec(message)
  if (uncaught) return uncaught[1]!

  const exceptionClass = /^([\w\\]+(?:Exception|Error)):/.exec(message)
  if (exceptionClass) return exceptionClass[1]!

  const phpLevel = /^PHP (Warning|Notice|Fatal error|Deprecated|Parse error):/.exec(message)
  if (phpLevel) return `PHP ${phpLevel[1]!}`

  return (message.split(':')[0] ?? '').slice(0, 60) || 'Unknown'
}
