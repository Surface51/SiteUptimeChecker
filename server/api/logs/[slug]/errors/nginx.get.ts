import { nginxErrorGroups } from '../../../../utils/logs/queries/errors'
import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'
import { respondListOrCsv } from '../../../../utils/logs/csv'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  const rows = await nginxErrorGroups(ctx)
  return respondListOrCsv(event, rows, 'groups', 'nginx-errors.csv')
})
