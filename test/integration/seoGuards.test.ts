import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import { getSeoState, listNotifications, updateSite } from '../../server/utils/db'
import { evaluateSeoGuards, type GuardHttpInput } from '../../server/utils/seo/guards'
import type { SeoFetch } from '../../server/utils/seo/fetch'

beforeEach(resetDb)

const HOUR = 60 * 60 * 1000

function http(head: string, headers: Record<string, string> = {}): GuardHttpInput {
  return {
    finalUrl: 'https://example.test/',
    httpStatus: 200,
    contentType: 'text/html',
    bodyText: `<html><head><title>Home</title>${head}</head><body></body></html>`,
    responseHeaders: headers,
    error: null,
  }
}

function robots(status: number, text = 'User-agent: *\nDisallow:'): SeoFetch {
  return async () => ({
    status,
    headers: {},
    body: status >= 200 && status < 300 ? Buffer.from(text) : null,
    location: null,
    timeMs: 1,
    error: status === 0 ? 'Timed out' : null,
  })
}

const seoAlerts = () => listNotifications({ limit: 50 }).filter((n) => n.type === 'seo_regression')

describe('evaluateSeoGuards', () => {
  it('records a baseline silently, then alerts on a noindex transition', async () => {
    const site = makeSite()
    await evaluateSeoGuards(site, http('<meta name="robots" content="index">'), { fetch: robots(200), now: Date.now() })
    expect(seoAlerts()).toHaveLength(0)
    expect(getSeoState(site.id)!.homepageRobots).toBe('index')

    await evaluateSeoGuards(site, http('', { 'X-Robots-Tag': 'noindex' }), { fetch: robots(200), now: Date.now() })
    const alerts = seoAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.context).toMatchObject({ kind: 'seo', rule: 'noindex' })
  })

  it('stays quiet for a site that was noindex from the start', async () => {
    const site = makeSite()
    const page = http('<meta name="robots" content="noindex">')
    await evaluateSeoGuards(site, page, { fetch: robots(200) })
    await evaluateSeoGuards(site, page, { fetch: robots(200) })
    expect(seoAlerts()).toHaveLength(0)
  })

  it('alerts when the canonical changes', async () => {
    const site = makeSite()
    await evaluateSeoGuards(site, http('<link rel="canonical" href="https://example.test/">'), { fetch: robots(200) })
    await evaluateSeoGuards(site, http('<link rel="canonical" href="https://staging.example.test/">'), { fetch: robots(200) })
    const [alert] = seoAlerts()
    expect(alert!.context).toMatchObject({ rule: 'canonical_changed', to: 'https://staging.example.test/' })
    expect(alert!.message).toContain('another host')
  })

  it('refreshes robots.txt at most hourly and alerts on Disallow: / and on 5xx', async () => {
    const site = makeSite()
    const t0 = Date.now()
    await evaluateSeoGuards(site, http(''), { fetch: robots(200), now: t0 })
    // Within the hour: not re-fetched, so a now-blocking robots.txt isn't seen yet.
    await evaluateSeoGuards(site, http(''), { fetch: robots(200, 'User-agent: *\nDisallow: /'), now: t0 + 10_000 })
    expect(seoAlerts()).toHaveLength(0)

    await evaluateSeoGuards(site, http(''), { fetch: robots(200, 'User-agent: *\nDisallow: /'), now: t0 + HOUR + 1 })
    expect(seoAlerts().map((n) => (n.context as { rule: string }).rule)).toEqual(['robots_blocked'])
    expect(getSeoState(site.id)!.robotsBlocked).toBe(true)

    await evaluateSeoGuards(site, http(''), { fetch: robots(503), now: t0 + 2 * HOUR + 2, retryMs: 0 })
    expect(seoAlerts().map((n) => (n.context as { rule: string }).rule).sort()).toEqual(['robots_blocked', 'robots_unreachable'])
  })

  it('does nothing when disabled or when the check did not return an HTML page', async () => {
    const site = updateSite(makeSite().id, { seoEnabled: false })!
    await evaluateSeoGuards(site, http(''), { fetch: robots(200) })
    expect(getSeoState(site.id)).toBeNull()

    const other = makeSite()
    await evaluateSeoGuards(other, { ...http(''), contentType: 'application/json' }, { fetch: robots(200) })
    await evaluateSeoGuards(other, { ...http(''), httpStatus: 503 }, { fetch: robots(200) })
    expect(getSeoState(other.id)).toBeNull()
  })
})
