import { explorerRows } from '../../../../../utils/logs/queries/explorer'
import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../../utils/logs/csv'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  const table = String(getRouterParam(event, 'table') || '')
  const isCsv = String(ctx.query.format || '').toLowerCase() === 'csv'
  const result = await explorerRows(ctx, table, {
    cursor: ctx.query.cursor ? String(ctx.query.cursor) : undefined,
    clientIp: ctx.query.client_ip ? String(ctx.query.client_ip) : undefined,
    status: ctx.query.status ? String(ctx.query.status) : undefined,
    search: ctx.query.search ? String(ctx.query.search) : undefined,
    limit: isCsv ? 5000 : Number(ctx.query.limit) || 50,
  })
  return isCsv
    ? respondListOrCsv(event, result.rows, 'rows', `${table}.csv`)
    : result
})
