import { ipProfile } from '../../../../../../utils/logs/queries/security'
import { resolveLogQueryForSite } from '../../../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  const ip = String(getRouterParam(event, 'ip') || '')
  return ipProfile(ctx, ip)
})
