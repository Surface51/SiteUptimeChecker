import { getSite } from '../../../utils/db'
import { refreshDomainInfo } from '../../../utils/domainInfo'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  const query = getQuery(event)
  const force = query.force === 'true' || query.force === '1'

  await refreshDomainInfo(site, { force })

  return { ok: true }
})
