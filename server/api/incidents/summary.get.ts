import { incidentTotals } from '../../utils/db'
import { parseIncidentFilter } from '../../utils/incidentQuery'

export default defineEventHandler((event) => incidentTotals(parseIncidentFilter(getQuery(event))))
