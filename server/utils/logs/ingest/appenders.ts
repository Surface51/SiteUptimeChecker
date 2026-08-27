import type { DuckDBAppender } from '@duckdb/node-api'
import { timestampValue } from '@duckdb/node-api'
import type { AccessRow, DbEventRow, FpmEventRow, MysqlSlowRow, NginxErrorAggRow, PhpErrorRow, PhpSlowRow } from '../parsers/types'

export function dateToTimestamp(d: Date) {
  return timestampValue(BigInt(d.getTime()) * BigInt(1000))
}

function appendVarcharOrNull(appender: DuckDBAppender, value: string | null) {
  if (value === null) appender.appendNull()
  else appender.appendVarchar(value)
}

export function appendAccessRow(appender: DuckDBAppender, row: AccessRow, serverId: number, fileId: number) {
  appender.appendUSmallInt(serverId)
  appender.appendTimestamp(dateToTimestamp(row.ts))
  appender.appendVarchar(row.clientIp)
  appender.appendVarchar(row.method)
  appender.appendVarchar(row.url)
  appender.appendVarchar(row.path)
  appender.appendVarchar(row.pathPattern)
  appender.appendBoolean(row.hasQuery)
  appender.appendUSmallInt(row.status)
  appender.appendUBigInt(BigInt(row.bytes))
  appender.appendVarchar(row.referer)
  appender.appendVarchar(row.userAgent)
  if (row.duration === null) appender.appendNull()
  else appender.appendDouble(row.duration)
  appendVarcharOrNull(appender, row.uaBrowser)
  appendVarcharOrNull(appender, row.uaOs)
  appendVarcharOrNull(appender, row.uaDevice)
  appender.appendBoolean(row.isBot)
  appendVarcharOrNull(appender, row.botName)
  appendVarcharOrNull(appender, row.country)
  appender.appendUInteger(fileId)
  appender.endRow()
}

export function appendNginxErrorAggRow(appender: DuckDBAppender, row: NginxErrorAggRow, serverId: number, fileId: number) {
  appender.appendUSmallInt(serverId)
  appender.appendTimestamp(dateToTimestamp(row.bucket))
  appender.appendVarchar(row.level)
  appender.appendVarchar(row.fingerprint)
  appender.appendUInteger(row.count)
  appender.appendVarchar(row.sampleMessage)
  appendVarcharOrNull(appender, row.sampleRequest)
  appendVarcharOrNull(appender, row.sampleHost)
  appender.appendUInteger(fileId)
  appender.endRow()
}

export function appendPhpErrorRow(appender: DuckDBAppender, row: PhpErrorRow, serverId: number, fileId: number) {
  appender.appendUSmallInt(serverId)
  appender.appendTimestamp(dateToTimestamp(row.ts))
  appender.appendVarchar(row.errorType)
  appender.appendVarchar(row.message)
  appendVarcharOrNull(appender, row.srcFile)
  if (row.srcLine === null) appender.appendNull()
  else appender.appendUInteger(row.srcLine)
  appender.appendVarchar(row.stack)
  appender.appendVarchar(row.fingerprint)
  appender.appendUInteger(fileId)
  appender.endRow()
}

export function appendFpmEventRow(appender: DuckDBAppender, row: FpmEventRow, serverId: number, fileId: number) {
  appender.appendUSmallInt(serverId)
  appender.appendTimestamp(dateToTimestamp(row.ts))
  appender.appendVarchar(row.level)
  appendVarcharOrNull(appender, row.pool)
  appender.appendVarchar(row.eventType)
  if (row.pid === null) appender.appendNull()
  else appender.appendUInteger(row.pid)
  if (row.exitCode === null) appender.appendNull()
  else appender.appendInteger(row.exitCode)
  if (row.lifetimeSec === null) appender.appendNull()
  else appender.appendDouble(row.lifetimeSec)
  if (row.slowSec === null) appender.appendNull()
  else appender.appendDouble(row.slowSec)
  appendVarcharOrNull(appender, row.requestUrl)
  appender.appendVarchar(row.message)
  appender.appendUInteger(fileId)
  appender.endRow()
}

export function appendPhpSlowRow(appender: DuckDBAppender, row: PhpSlowRow, serverId: number, fileId: number) {
  appender.appendUSmallInt(serverId)
  appender.appendTimestamp(dateToTimestamp(row.ts))
  appendVarcharOrNull(appender, row.pool)
  if (row.pid === null) appender.appendNull()
  else appender.appendUInteger(row.pid)
  appendVarcharOrNull(appender, row.script)
  appender.appendVarchar(row.stack)
  appender.appendVarchar(row.fingerprint)
  appender.appendUInteger(fileId)
  appender.endRow()
}

export function appendMysqlSlowRow(appender: DuckDBAppender, row: MysqlSlowRow, serverId: number, fileId: number) {
  appender.appendUSmallInt(serverId)
  appender.appendTimestamp(dateToTimestamp(row.ts))
  appendVarcharOrNull(appender, row.dbUser)
  appendVarcharOrNull(appender, row.dbHost)
  if (row.threadId === null) appender.appendNull()
  else appender.appendUInteger(row.threadId)
  appendVarcharOrNull(appender, row.dbSchema)
  if (row.qcHit === null) appender.appendNull()
  else appender.appendBoolean(row.qcHit)
  appender.appendDouble(row.queryTime)
  appender.appendDouble(row.lockTime)
  appender.appendUBigInt(BigInt(row.rowsSent))
  appender.appendUBigInt(BigInt(row.rowsExamined))
  if (row.rowsAffected === null) appender.appendNull()
  else appender.appendUBigInt(BigInt(row.rowsAffected))
  if (row.bytesSent === null) appender.appendNull()
  else appender.appendUBigInt(BigInt(row.bytesSent))
  appender.appendVarchar(row.sqlText)
  appender.appendVarchar(row.fingerprint)
  appender.appendVarchar(row.fingerprintHash)
  appender.appendUInteger(fileId)
  appender.endRow()
}

export function appendDbEventRow(appender: DuckDBAppender, row: DbEventRow, serverId: number, fileId: number) {
  appender.appendUSmallInt(serverId)
  appender.appendTimestamp(dateToTimestamp(row.ts))
  if (row.threadId === null) appender.appendNull()
  else appender.appendUInteger(row.threadId)
  appender.appendVarchar(row.level)
  appender.appendVarchar(row.message)
  appender.appendUInteger(fileId)
  appender.endRow()
}
