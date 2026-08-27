import { httpErrorTop } from '../../../../utils/logs/queries/errors'
import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../utils/logs/csv'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  const rows = await httpErrorTop(ctx, ctx.query.status ? String(ctx.query.status) : null)
  return respondListOrCsv(event, rows, 'top', 'http-errors-top.csv')
})
