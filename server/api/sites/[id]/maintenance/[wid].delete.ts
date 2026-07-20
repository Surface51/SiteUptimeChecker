import { deleteMaintenanceWindow, getSite } from '../../../../utils/db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const wid = Number(getRouterParam(event, 'wid'))
  if (!Number.isInteger(id) || !Number.isInteger(wid)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  deleteMaintenanceWindow(wid)
  setResponseStatus(event, 204)
  return null
})
