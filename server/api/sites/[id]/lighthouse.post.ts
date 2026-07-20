import type { LighthouseFormFactor } from '#shared/types'
import { getSite } from '../../../utils/db'
import { enqueueLighthouse } from '../../../utils/lighthouse'

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
  if (query.formFactor === 'mobile' || query.formFactor === 'desktop') {
    return enqueueLighthouse(site, query.formFactor)
  }

  const formFactors: LighthouseFormFactor[] = ['mobile', 'desktop']
  return Promise.all(formFactors.map((formFactor) => enqueueLighthouse(site, formFactor)))
})
