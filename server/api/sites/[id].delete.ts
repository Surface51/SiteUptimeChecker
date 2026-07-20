import { unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { deleteSite, getScreenshotsDir, getSite } from '../../utils/db'
import { unscheduleSite } from '../../utils/scheduler'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  unscheduleSite(id)
  deleteSite(id)

  try {
    unlinkSync(join(getScreenshotsDir(), `${id}.png`))
  } catch {
    // no screenshot on disk — fine
  }

  setResponseStatus(event, 204)
  return null
})
