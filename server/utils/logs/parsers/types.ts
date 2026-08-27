export interface AccessRow {
  ts: Date
  clientIp: string
  method: string
  url: string
  path: string
  pathPattern: string
  hasQuery: boolean
  status: number
  bytes: number
  referer: string
  userAgent: string
  duration: number | null
  uaBrowser: string | null
  uaOs: string | null
  uaDevice: string | null
  isBot: boolean
  botName: string | null
  country: string | null
}

export interface NginxErrorAggRow {
  bucket: Date
  level: string
  fingerprint: string
  count: number
  sampleMessage: string
  sampleRequest: string | null
  sampleHost: string | null
}

export interface PhpErrorRow {
  ts: Date
  errorType: string
  message: string
  srcFile: string | null
  srcLine: number | null
  stack: string
  fingerprint: string
}

export interface FpmEventRow {
  ts: Date
  level: string
  pool: string | null
  eventType: 'child_started' | 'child_exited' | 'slow_exec' | 'max_children' | 'other'
  pid: number | null
  exitCode: number | null
  lifetimeSec: number | null
  slowSec: number | null
  requestUrl: string | null
  message: string
}

export interface PhpSlowRow {
  ts: Date
  pool: string | null
  pid: number | null
  script: string | null
  stack: string
  fingerprint: string
}

export interface MysqlSlowRow {
  ts: Date
  dbUser: string | null
  dbHost: string | null
  threadId: number | null
  dbSchema: string | null
  qcHit: boolean | null
  queryTime: number
  lockTime: number
  rowsSent: number
  rowsExamined: number
  rowsAffected: number | null
  bytesSent: number | null
  sqlText: string
  fingerprint: string
  fingerprintHash: string
}

export interface DbEventRow {
  ts: Date
  threadId: number | null
  level: string
  message: string
}

/** A streaming line parser: feed lines as they arrive, flush at EOF to emit any buffered record. */
export interface LineParser<T> {
  feedLine(line: string): T[]
  flush(): T[]
}
