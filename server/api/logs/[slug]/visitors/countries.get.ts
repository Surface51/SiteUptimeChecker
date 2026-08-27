import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../utils/logs/csv'
import { visitorCountries } from '../../../../utils/logs/queries/visitors'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  const rows = await visitorCountries(ctx)
  return respondListOrCsv(event, rows, 'countries', 'countries.csv')
})
