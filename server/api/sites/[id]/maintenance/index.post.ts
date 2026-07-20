import { getSite, insertMaintenanceWindow } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  const body = await readBody<{ startsAt?: string; endsAt?: string; reason?: string | null }>(event)

  if (!body?.startsAt || !body?.endsAt) {
    throw createError({ statusCode: 400, statusMessage: 'startsAt and endsAt are required' })
  }

  const startsAt = new Date(body.startsAt)
  const endsAt = new Date(body.endsAt)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid window: endsAt must be after startsAt' })
  }

  setResponseStatus(event, 201)
  return insertMaintenanceWindow({
    siteId: id,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    reason: body.reason?.trim() || null,
  })
})
