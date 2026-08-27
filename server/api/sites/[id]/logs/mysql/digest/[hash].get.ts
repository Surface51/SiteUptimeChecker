import { mysqlDigestSamples } from '../../../../../../utils/logs/queries/stack'
import { resolveLogQueryForSite } from '../../../../../../utils/logs/resolve'

export default defineEventHandler(async (event) => {
  const ctx = await resolveLogQueryForSite(event)
  const hash = String(getRouterParam(event, 'hash') || '')
  return { samples: await mysqlDigestSamples(ctx, hash) }
})
