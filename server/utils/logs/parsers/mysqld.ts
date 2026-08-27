import type { DbEventRow, LineParser } from './types'
import { parseMysqldTimestamp } from './dates'

// "2025-09-02  2:22:54 99 [Warning] Aborted connection 99 ..." — variable-width hour.
// Startup banner lines ("Version: '...' socket: ... port: ...") and blank lines don't match
// and are silently skipped — they're a normal, expected part of this log, not parse failures.
const LINE_RE = /^(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2})\s+(\d+)\s+\[(\w+)\]\s+(.*)$/

export class MysqldParser implements LineParser<DbEventRow> {
  feedLine(line: string): DbEventRow[] {
    const m = LINE_RE.exec(line)
    if (!m) return []

    const [, tsRaw, threadIdRaw, level, message] = m
    const ts = parseMysqldTimestamp(tsRaw!)
    if (!ts) return []

    return [{
      ts,
      threadId: Number(threadIdRaw),
      level: level!,
      message: message!
    }]
  }

  flush(): DbEventRow[] {
    return []
  }

  getErrorCount(): number {
    return 0
  }
}
