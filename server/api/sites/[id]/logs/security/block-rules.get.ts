import { buildBlockRules } from '../../../../../utils/logs/queries/security'
import { resolveLogQueryForSite } from '../../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  return buildBlockRules(String(ctx.query.ips || ''))
})
