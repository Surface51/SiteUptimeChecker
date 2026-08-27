import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../utils/logs/csv'
import { trafficStatusCodes } from '../../../../utils/logs/queries/traffic'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  const rows = await trafficStatusCodes(ctx)
  return respondListOrCsv(event, rows, 'statusCodes', 'status-codes.csv')
})
