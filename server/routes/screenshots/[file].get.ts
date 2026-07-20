import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getScreenshotsDir } from '../../utils/db'

export default defineEventHandler((event) => {
  const file = getRouterParam(event, 'file') || ''
  if (!/^\d+\.png$/.test(file)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid file' })
  }

  const path = join(getScreenshotsDir(), file)
  if (!existsSync(path)) {
    throw createError({ statusCode: 404, statusMessage: 'Screenshot not found' })
  }

  setResponseHeader(event, 'content-type', 'image/png')
  setResponseHeader(event, 'cache-control', 'no-cache')
  return sendStream(event, createReadStream(path))
})
