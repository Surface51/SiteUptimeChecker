import { resolveLogQueryForSlug } from '../../../../utils/logs/resolve'
import { securityThreats } from '../../../../utils/logs/queries/security'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  return securityThreats(ctx)
})
