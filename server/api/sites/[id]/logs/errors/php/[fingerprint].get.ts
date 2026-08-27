import { phpErrorOccurrences } from '../../../../../../utils/logs/queries/errors'
import { resolveLogQueryForSite } from '../../../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  const fingerprint = String(getRouterParam(event, 'fingerprint') || '')
  return { occurrences: await phpErrorOccurrences(ctx, fingerprint) }
})
