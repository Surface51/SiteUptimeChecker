import { mysqlDigest } from '../../../../utils/logs/queries/stack'
import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../utils/logs/csv'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  const rows = await mysqlDigest(ctx)
  return respondListOrCsv(event, rows, 'digest', 'mysql-digest.csv')
})
