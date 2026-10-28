import type { IncidentFilter } from './db'

/** Parses the filter params shared by the incident list and summary endpoints. */
export function parseIncidentFilter(query: Record<string, unknown>): Omit<IncidentFilter, 'limit' | 'offset'> {
  const siteId = query.siteId !== undefined ? Number(query.siteId) : undefined
  const minDuration = Number(query.minDuration)
  return {
    siteId: siteId !== undefined && Number.isInteger(siteId) ? siteId : undefined,
    status: query.status === 'open' || query.status === 'resolved' ? query.status : undefined,
    minDurationSeconds: Number.isFinite(minDuration) && minDuration > 0 ? Math.floor(minDuration) : undefined,
  }
}
