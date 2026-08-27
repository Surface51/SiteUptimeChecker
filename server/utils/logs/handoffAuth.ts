import { timingSafeEqual } from 'node:crypto'
import { createError, getHeader, type H3Event } from 'h3'

/**
 * Guards the DB-handoff endpoints. This app ships with no auth, so the default is
 * loopback-only — enough for the local `logs:ingest` CLI. Setting `UPTIME_CLI_TOKEN` makes a
 * matching `Authorization: Bearer` header mandatory instead, for a host that is reachable
 * beyond localhost.
 */
export function assertHandoffAllowed(event: H3Event): void {
  const token = process.env.UPTIME_CLI_TOKEN
  if (token) {
    const provided = (getHeader(event, 'authorization') ?? '').replace(/^Bearer\s+/i, '')
    const a = Buffer.from(provided)
    const b = Buffer.from(token)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid or missing handoff token' })
    }
    return
  }

  const ip =
    event.node.req.socket.remoteAddress ?? getHeader(event, 'x-forwarded-for') ?? ''
  const loopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
  if (!loopback) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Log DB handoff is loopback-only unless UPTIME_CLI_TOKEN is set',
    })
  }
}
