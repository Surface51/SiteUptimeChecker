import { nginxErrorGroups } from '../../../../../utils/logs/queries/errors'
import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../../utils/logs/csv'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  const rows = await nginxErrorGroups(ctx)
  return respondListOrCsv(event, rows, 'groups', 'nginx-errors.csv')
})
