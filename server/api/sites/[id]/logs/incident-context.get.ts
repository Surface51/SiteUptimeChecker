import { getSite, listIncidents } from '../../../../utils/db'
import { resolveLogServers } from '../../../../utils/logs/apiHelpers'
import { incidentContext } from '../../../../utils/logs/queries/incidentContext'

// Padding either side of the incident: whatever caused an outage usually starts before the
// check notices, and the recovery tail is worth seeing too.
const PAD_MS = 15 * 60_000

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const incidentId = Number(getQuery(event).incidentId)
  if (!Number.isInteger(incidentId)) {
    throw createError({ statusCode: 400, statusMessage: 'incidentId is required' })
  }

  const site = getSite(id)
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  if (!site.logSlug) {
    throw createError({ statusCode: 409, statusMessage: 'Site is not linked to a log folder' })
  }

  const incident = listIncidents(id, 200).find((row) => row.id === incidentId)
  if (!incident) throw createError({ statusCode: 404, statusMessage: 'Incident not found' })

  // SQLite stores UTC as "YYYY-MM-DD HH:MM:SS" with no offset; the Z makes that explicit so it
  // lines up with the DuckDB timestamps, which are already UTC.
  const startedAt = new Date(`${incident.startedAt.replace(' ', 'T')}Z`).getTime()
  const endedAt = incident.endedAt
    ? new Date(`${incident.endedAt.replace(' ', 'T')}Z`).getTime()
    : Date.now()

  const { serverIds } = await resolveLogServers(site.logSlug)
  if (serverIds.length === 0) return { incident, context: null }

  const context = await incidentContext({
    serverIds,
    from: new Date(startedAt - PAD_MS),
    to: new Date(endedAt + PAD_MS),
  })

  return { incident, context, window: { from: startedAt - PAD_MS, to: endedAt + PAD_MS } }
})
