import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../utils/logs/csv'
import { visitorBrowsers } from '../../../../utils/logs/queries/visitors'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  const rows = await visitorBrowsers(ctx)
  return respondListOrCsv(event, rows, 'browsers', 'browsers.csv')
})
