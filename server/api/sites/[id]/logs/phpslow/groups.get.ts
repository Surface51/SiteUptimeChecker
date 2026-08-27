import { phpSlowGroups } from '../../../../../utils/logs/queries/stack'
import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../../utils/logs/csv'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  const rows = await phpSlowGroups(ctx)
  return respondListOrCsv(event, rows, 'groups', 'php-slow-groups.csv')
})
