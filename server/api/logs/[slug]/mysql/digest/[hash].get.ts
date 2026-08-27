import { mysqlDigestSamples } from '../../../../../utils/logs/queries/stack'
import { resolveLogQueryForSlug } from '../../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSlug(event)
  const hash = String(getRouterParam(event, 'hash') || '')
  return { samples: await mysqlDigestSamples(ctx, hash) }
})
