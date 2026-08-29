import { getSite, getSlaReport } from '../../../utils/db'

const MONTH_RE = /^\d{4}-\d{2}$/

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }
  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  const monthRaw = getQuery(event).month
  const month = typeof monthRaw === 'string' && MONTH_RE.test(monthRaw) ? monthRaw : undefined

  // Null (no SLA target set) is a valid, expected state — the client hides the panel.
  return getSlaReport(id, month)
})
