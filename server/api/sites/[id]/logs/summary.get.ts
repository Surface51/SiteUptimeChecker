import { getSite } from '../../../../utils/db'
import { resolveLogServers } from '../../../../utils/logs/apiHelpers'
import { trafficSummary } from '../../../../utils/logs/queries/traffic'

/**
 * Last-24h traffic for the site detail page. Unlike the other endpoints in this namespace, an
 * unlinked site is not an error here — the page asks unconditionally and simply renders nothing
 * when there are no logs, so `null` is the honest answer rather than a 409.
 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  if (!site.logSlug) return null

  const { serverIds } = await resolveLogServers(site.logSlug)
  if (serverIds.length === 0) return null

  const now = Date.now()
  return trafficSummary({
    serverIds,
    from: new Date(now - 24 * 3_600_000),
    to: new Date(now),
  })
})
