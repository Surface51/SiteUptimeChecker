import { createError } from 'h3'
import { rangeParams, sanitizeLogRows, serverIdsClause, type LogScope } from '../apiHelpers'
import { EXPLORER_TABLES } from '../explorer'
import { queryLogs } from '../logDb'

export interface ExplorerFilters {
  cursor?: string
  clientIp?: string
  status?: string
  search?: string
  limit: number
}

/**
 * Raw-row browser over the log tables. The table name and every selected column come from
 * EXPLORER_TABLES rather than the request — that whitelist is what makes the interpolated
 * FROM/SELECT/ORDER BY safe. Filter *values* are always bound parameters.
 */
export async function explorerRows(scope: LogScope, table: string, filters: ExplorerFilters) {
  const config = EXPLORER_TABLES[table]
  if (!config) {
    throw createError({ statusCode: 400, statusMessage: `Unknown explorer table: ${table}` })
  }

  const limit = Math.min(Math.max(filters.limit, 1), 5000)
  const conditions = [
    `server_id IN ${serverIdsClause(scope.serverIds)}`,
    `${config.timeColumn} BETWEEN $from AND $to`,
  ]
  const params: Record<string, unknown> = rangeParams(scope)

  if (filters.cursor) {
    conditions.push(`${config.timeColumn} < $cursor`)
    params.cursor = filters.cursor
  }
  if (config.hasClientIp && filters.clientIp) {
    conditions.push(`client_ip = $clientIp`)
    params.clientIp = filters.clientIp
  }
  if (config.hasStatus && filters.status) {
    conditions.push(`status = $status`)
    params.status = Number(filters.status)
  }
  if (config.hasPathSearch && filters.search) {
    conditions.push(`${config.hasPathSearch} ILIKE '%' || $search || '%'`)
    params.search = filters.search
  }

  // One extra row tells us whether another page exists without a second count query.
  const rows = await queryLogs(
    `SELECT ${config.columns.join(', ')}
     FROM ${table}
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${config.timeColumn} DESC
     LIMIT ${limit + 1}`,
    params,
  )

  const hasMore = rows.length > limit
  const page = rows.slice(0, limit)
  const lastVal = page[page.length - 1]?.[config.timeColumn]
  const nextCursor = hasMore && lastVal instanceof Date ? lastVal.toISOString() : null

  return { table, columns: config.columns, rows: sanitizeLogRows(page), nextCursor }
}
