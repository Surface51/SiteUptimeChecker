import { listAllIncidents } from '../../utils/db'
import { parseIncidentFilter } from '../../utils/incidentQuery'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200)
  const offset = Math.max(Number(query.offset) || 0, 0)

  return listAllIncidents({ ...parseIncidentFilter(query), limit, offset })
})
