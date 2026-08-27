import type { LineParser, MysqlSlowRow } from './types'
import { normalizeSql, hashSql } from '../fingerprint/sql'

const USER_HOST_RE = /^# User@Host:\s*([^\[]*)\[[^\]]*\]\s*@\s*([^\[]*)\[([^\]]*)\]$/
const THREAD_RE = /^# Thread_id:\s*(\d+)\s+Schema:\s*(\S*)\s+QC_hit:\s*(\w+)$/
const QUERY_TIME_RE = /^# Query_time:\s*([\d.]+)\s+Lock_time:\s*([\d.]+)\s+Rows_sent:\s*(\d+)\s+Rows_examined:\s*(\d+)$/
const ROWS_AFFECTED_RE = /^# Rows_affected:\s*(\d+)\s+Bytes_sent:\s*(\d+)$/
const TIMESTAMP_RE = /^SET timestamp=(\d+);$/

interface PendingRecord {
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
  epoch: number | null
  sqlLines: string[]
}

function emptyPending(): PendingRecord {
  return {
    dbUser: null, dbHost: null, threadId: null, dbSchema: null, qcHit: null,
    queryTime: 0, lockTime: 0, rowsSent: 0, rowsExamined: 0,
    rowsAffected: null, bytesSent: null, epoch: null, sqlLines: []
  }
}

/** Streams the classic MySQL/MariaDB slow query log format. Record boundary is `# User@Host:`
 * (not `# Time:`, which only prints when it changes and can be shared by many records). */
export class MysqlSlowParser implements LineParser<MysqlSlowRow> {
  private errorCount = 0
  private pending: PendingRecord | null = null

  feedLine(line: string): MysqlSlowRow[] {
    if (line.startsWith('# Time:')) {
      return [] // informational only; SET timestamp= is the authoritative per-record clock
    }

    const userHost = USER_HOST_RE.exec(line)
    if (userHost) {
      const finished = this.pending ? this.finalizeIfComplete(this.pending) : []
      this.pending = emptyPending()
      this.pending.dbUser = userHost[1]?.trim() || null
      const hostname = userHost[2]?.trim()
      const ip = userHost[3]?.trim()
      this.pending.dbHost = hostname || ip || null
      return finished
    }

    if (!this.pending) {
      if (line.trim()) this.errorCount++
      return []
    }

    const thread = THREAD_RE.exec(line)
    if (thread) {
      this.pending.threadId = Number(thread[1])
      this.pending.dbSchema = thread[2] || null
      this.pending.qcHit = thread[3]?.toLowerCase() === 'yes'
      return []
    }

    const queryTime = QUERY_TIME_RE.exec(line)
    if (queryTime) {
      this.pending.queryTime = Number(queryTime[1])
      this.pending.lockTime = Number(queryTime[2])
      this.pending.rowsSent = Number(queryTime[3])
      this.pending.rowsExamined = Number(queryTime[4])
      return []
    }

    const rowsAffected = ROWS_AFFECTED_RE.exec(line)
    if (rowsAffected) {
      this.pending.rowsAffected = Number(rowsAffected[1])
      this.pending.bytesSent = Number(rowsAffected[2])
      return []
    }

    const ts = TIMESTAMP_RE.exec(line)
    if (ts) {
      this.pending.epoch = Number(ts[1])
      return []
    }

    if (/^use \S+;$/i.test(line.trim())) return []

    this.pending.sqlLines.push(line)
    return []
  }

  flush(): MysqlSlowRow[] {
    const rows = this.pending ? this.finalizeIfComplete(this.pending) : []
    this.pending = null
    return rows
  }

  getErrorCount(): number {
    return this.errorCount
  }

  private finalizeIfComplete(pending: PendingRecord): MysqlSlowRow[] {
    if (pending.epoch === null || pending.sqlLines.length === 0) {
      this.errorCount++
      return []
    }
    const sqlText = pending.sqlLines.join('\n').trim()
    const fingerprint = normalizeSql(sqlText)
    return [{
      ts: new Date(pending.epoch * 1000),
      dbUser: pending.dbUser,
      dbHost: pending.dbHost,
      threadId: pending.threadId,
      dbSchema: pending.dbSchema,
      qcHit: pending.qcHit,
      queryTime: pending.queryTime,
      lockTime: pending.lockTime,
      rowsSent: pending.rowsSent,
      rowsExamined: pending.rowsExamined,
      rowsAffected: pending.rowsAffected,
      bytesSent: pending.bytesSent,
      sqlText,
      fingerprint,
      fingerprintHash: hashSql(fingerprint)
    }]
  }
}
