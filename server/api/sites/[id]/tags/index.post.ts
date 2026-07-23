import { addSiteTag, getSite } from '../../../../utils/db'

const MAX_TAG_LENGTH = 30

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  const body = await readBody<{ tag?: string }>(event)
  const tag = body?.tag?.trim().replace(/\s+/g, ' ')

  if (!tag) {
    throw createError({ statusCode: 400, statusMessage: 'tag is required' })
  }
  if (tag.length > MAX_TAG_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `Tag must be ${MAX_TAG_LENGTH} characters or fewer` })
  }

  setResponseStatus(event, 201)
  return { tags: addSiteTag(id, tag) }
})
