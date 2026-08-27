import { createError, getQuery, getRouterParam, type H3Event } from 'h3'
import { getSite } from '../db'
import { listLogEnvs, parseLogTimeRange, resolveLogServers, type LogTimeRange } from './apiHelpers'
import { isValidLogSlug } from './slug'

export interface LogQueryContext extends LogTimeRange {
  slug: string
  env?: string
  serverIds: number[]
  query: Record<string, unknown>
}

async function buildContext(event: H3Event, slug: string): Promise<LogQueryContext> {
  const query = getQuery(event) as Record<string, unknown>
  const env = query.env ? String(query.env) : undefined

  const { serverIds } = await resolveLogServers(slug, env)
  const { from, to } = parseLogTimeRange(query)

  return { slug, env, serverIds, from, to, query }
}

/**
 * Resolves `/api/sites/:id/logs/...` — the monitored-site entry point. The site id is this app's
 * own SQLite key; `log_slug` is what ties it to a folder in log-ingress/ and hence to rows in the
 * DuckDB store. A site with no slug is a 409 rather than a 404: the site exists, it just hasn't
 * been linked to any logs yet, and the UI uses that to prompt for linking.
 */
export async function resolveLogQueryForSite(event: H3Event): Promise<LogQueryContext> {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site id' })
  }

  const site = getSite(id)
  if (!site) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  }
  if (!site.logSlug) {
    throw createError({ statusCode: 409, statusMessage: 'Site is not linked to a log folder' })
  }

  return buildContext(event, site.logSlug)
}

/** Resolves `/api/logs/:slug/...` — log folders browsed directly, including ones that don't
 * correspond to any monitored site. */
export async function resolveLogQueryForSlug(event: H3Event): Promise<LogQueryContext> {
  const slug = String(getRouterParam(event, 'slug') ?? '')
  if (!isValidLogSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid log folder name' })
  }

  return buildContext(event, slug)
}

/** Environments available for whichever slug the route resolves to. */
export async function logEnvsFor(context: LogQueryContext): Promise<string[]> {
  return listLogEnvs(context.slug)
}
