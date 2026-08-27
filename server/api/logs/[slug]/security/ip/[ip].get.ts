import { ipProfile } from '../../../../../utils/logs/queries/security'
import { resolveLogQueryForSlug } from '../../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  const ip = String(getRouterParam(event, 'ip') || '')
  return ipProfile(ctx, ip)
})
