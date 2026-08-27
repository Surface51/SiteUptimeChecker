import { phpSlowGroups } from '../../../../utils/logs/queries/stack'
import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../utils/logs/csv'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  const rows = await phpSlowGroups(ctx)
  return respondListOrCsv(event, rows, 'groups', 'php-slow-groups.csv')
})
