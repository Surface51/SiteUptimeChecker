import { getSite } from '../utils/db'
import { resolveLogServers } from '../utils/logs/apiHelpers'
import { trafficSummary } from '../utils/logs/queries/traffic'

/**
 * Traffic figures for the sites being compared.
 *
 * Kept separate from /api/compare rather than folded into buildComparison(): that one is a
 * synchronous SQLite read, while this hits DuckDB asynchronously and only some sites have logs
 * at all. The compare page fetches both in parallel and shows a dash where there's no data.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const ids = String(query.ids || '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 6)

  if (ids.length === 0) return { traffic: [] }

  const hours = Math.min(Math.max(Number(query.hours) || 24, 1), 24 * 90)
  const now = Date.now()
  const window = { from: new Date(now - hours * 3_600_000), to: new Date(now) }

  const traffic = await Promise.all(
    ids.map(async (id) => {
      const site = getSite(id)
      if (!site?.logSlug) return { siteId: id, summary: null }

      const { serverIds } = await resolveLogServers(site.logSlug)
      if (serverIds.length === 0) return { siteId: id, summary: null }

      return { siteId: id, summary: await trafficSummary({ serverIds, ...window }) }
    }),
  )

  return { hours, traffic }
})
