import { buildBlockRules } from '../../../../utils/logs/queries/security'
import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  return buildBlockRules(String(ctx.query.ips || ''))
})
