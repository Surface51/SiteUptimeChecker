import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../../utils/logs/csv'
import { visitorOperatingSystems } from '../../../../../utils/logs/queries/visitors'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  const rows = await visitorOperatingSystems(ctx)
  return respondListOrCsv(event, rows, 'os', 'operating-systems.csv')
})
