import { getSite, listSubdomains, setSubdomainIgnored } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }

  const hostnameParam = getRouterParam(event, 'hostname')
  if (!hostnameParam) {
    throw createError({ statusCode: 400, statusMessage: 'hostname is required' })
  }
  const hostname = decodeURIComponent(hostnameParam)

  const body = await readBody<{ ignored?: boolean }>(event)
  if (typeof body?.ignored !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'ignored (boolean) is required' })
  }

  setSubdomainIgnored(id, hostname, body.ignored)

  const row = listSubdomains(id).find((s) => s.hostname === hostname)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Subdomain not found' })
  }
  return row
})
