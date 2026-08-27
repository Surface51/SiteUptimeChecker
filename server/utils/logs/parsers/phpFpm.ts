import type { FpmEventRow, LineParser } from './types'
import { parsePhpTimestamp } from './dates'

const START_RE = /^\[(\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2})\] (\w+): (?:\[pool (\w+)\] )?(.*)$/
const EXITED_RE = /^child (\d+) exited with code (-?\d+) after ([\d.]+) seconds from start$/
const STARTED_RE = /^child (\d+) started$/
const SLOW_RE = /^child (\d+), script '[^']*' \(request: "([^"]*)"\) executing too slow \(([\d.]+) sec\), logging$/
const MAX_CHILDREN_RE = /^server reached (?:pm\.)?max_children setting \((\d+)\)/

export class PhpFpmParser implements LineParser<FpmEventRow> {
  private errorCount = 0

  feedLine(line: string): FpmEventRow[] {
    const start = START_RE.exec(line)
    if (!start) {
      if (line.trim()) this.errorCount++
      return []
    }

    const [, tsRaw, level, pool, rest] = start
    const ts = parsePhpTimestamp(tsRaw!)
    if (!ts) {
      this.errorCount++
      return []
    }

    const base = { ts, level: level!, pool: pool ?? null }

    const exited = EXITED_RE.exec(rest!)
    if (exited) {
      return [{
        ...base,
        eventType: 'child_exited',
        pid: Number(exited[1]),
        exitCode: Number(exited[2]),
        lifetimeSec: Number(exited[3]),
        slowSec: null,
        requestUrl: null,
        message: rest!
      }]
    }

    const started = STARTED_RE.exec(rest!)
    if (started) {
      return [{
        ...base,
        eventType: 'child_started',
        pid: Number(started[1]),
        exitCode: null,
        lifetimeSec: null,
        slowSec: null,
        requestUrl: null,
        message: rest!
      }]
    }

    const slow = SLOW_RE.exec(rest!)
    if (slow) {
      return [{
        ...base,
        eventType: 'slow_exec',
        pid: Number(slow[1]),
        exitCode: null,
        lifetimeSec: null,
        slowSec: Number(slow[3]),
        requestUrl: slow[2] || null,
        message: rest!
      }]
    }

    const maxChildren = MAX_CHILDREN_RE.exec(rest!)
    if (maxChildren) {
      return [{
        ...base,
        eventType: 'max_children',
        pid: null,
        exitCode: null,
        lifetimeSec: null,
        slowSec: null,
        requestUrl: null,
        message: rest!
      }]
    }

    return [{
      ...base,
      eventType: 'other',
      pid: null,
      exitCode: null,
      lifetimeSec: null,
      slowSec: null,
      requestUrl: null,
      message: rest!
    }]
  }

  flush(): FpmEventRow[] {
    return []
  }

  getErrorCount(): number {
    return this.errorCount
  }
}
