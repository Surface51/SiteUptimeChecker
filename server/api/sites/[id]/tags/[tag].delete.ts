import { getSite, removeSiteTag } from '../../../../utils/db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  const tag = getRouterParam(event, 'tag')
  if (!tag) {
    throw createError({ statusCode: 400, statusMessage: 'tag is required' })
  }

  return { tags: removeSiteTag(id, decodeURIComponent(tag)) }
})
