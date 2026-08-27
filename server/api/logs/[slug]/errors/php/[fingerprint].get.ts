import { phpErrorOccurrences } from '../../../../../utils/logs/queries/errors'
import { resolveLogQueryForSlug } from '../../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  const fingerprint = String(getRouterParam(event, 'fingerprint') || '')
  return { occurrences: await phpErrorOccurrences(ctx, fingerprint) }
})
