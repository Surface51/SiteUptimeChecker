import { describe, expect, it } from 'vitest'
import type { SeoIssue } from '#shared/types'
import { crawlSite } from '../../../server/utils/seo/crawler'
import type { SeoFetch, SeoFetchResult } from '../../../server/utils/seo/fetch'
import { newErrorCodes } from '../../../server/utils/seo/scheduler'

const O = 'https://example.test'

type Route = { status: number; html?: string; xml?: string; text?: string; location?: string; headers?: Record<string, string> }

function page(title: string, body = '', head = '') {
  return `<html><head><title>${title}</title><meta name="description" content="${'A sufficiently long meta description for ' + title + ', padded out.'}">${head}</head><body><h1>${title}</h1>${body}</body></html>`
}

function fakeSite(routes: Record<string, Route>): { fetch: SeoFetch; hits: string[] } {
  const hits: string[] = []
  const fetch: SeoFetch = async (url) => {
    hits.push(url)
    const r = routes[url]
    if (!r) return { status: 404, headers: {}, body: null, location: null, timeMs: 1, error: null }
    const headers: Record<string, string> = { ...(r.headers ?? {}) }
    let body: Buffer | null = null
    if (r.html !== undefined) {
      headers['content-type'] = 'text/html; charset=utf-8'
      body = Buffer.from(r.html)
    } else if (r.xml !== undefined) {
      headers['content-type'] = 'application/xml'
      body = Buffer.from(r.xml)
    } else if (r.text !== undefined) {
      headers['content-type'] = 'text/plain'
      body = Buffer.from(r.text)
    }
    const res: SeoFetchResult = { status: r.status, headers, body, location: r.location ?? null, timeMs: 5, error: null }
    return res
  }
  return { fetch, hits }
}

const codes = (issues: SeoIssue[]) => issues.map((i) => `${i.code}:${new URL(i.url).pathname}`).sort()

describe('crawlSite', () => {
  it('finds the expected issues across a small site', async () => {
    const { fetch, hits } = fakeSite({
      [`${O}/robots.txt`]: { status: 200, text: `User-agent: *\nDisallow: /private\nSitemap: ${O}/sitemap.xml` },
      [`${O}/sitemap.xml`]: {
        status: 200,
        xml: `<urlset>${['/', '/about', '/gone', '/hidden', '/old', '/private/x']
          .map((p) => `<url><loc>${O}${p}</loc></url>`)
          .join('')}</urlset>`,
      },
      [`${O}/`]: { status: 200, html: page('Home page title', '<a href="/about">a</a><a href="/missing">m</a><a href="/hop1">h</a>') },
      [`${O}/about`]: { status: 200, html: page('Home page title', '', `<link rel="canonical" href="${O}/about">`) },
      [`${O}/gone`]: { status: 500, html: 'oops' },
      [`${O}/hidden`]: { status: 200, html: page('Hidden page', '', '<meta name="robots" content="noindex">') },
      [`${O}/old`]: { status: 301, location: '/' },
      [`${O}/hop1`]: { status: 301, location: '/hop2' },
      [`${O}/hop2`]: { status: 302, location: '/about' },
    })

    const result = await crawlSite(`${O}/`, { fetch, delayMs: 0, concurrency: 2 })

    expect(result.sitemapUrls).toBe(6)
    expect(hits).not.toContain(`${O}/private/x`)
    expect(codes(result.issues)).toEqual(
      [
        'broken_link:/missing',
        // Same title → the generated description is shared too.
        'description_duplicate:/',
        'description_duplicate:/about',
        'redirect_chain:/hop1',
        'sitemap_blocked:/private/x',
        'sitemap_noindex:/hidden',
        'sitemap_non_200:/gone',
        'sitemap_non_200:/old',
        'title_duplicate:/',
        'title_duplicate:/about',
      ].sort(),
    )
    const broken = result.issues.find((i) => i.code === 'broken_link')!
    expect(broken.sourceUrl).toBe(`${O}/`)
    expect(result.issues.find((i) => i.url === `${O}/old`)!.severity).toBe('warn')
    expect(result.pages.find((p) => p.url === `${O}/hop1`)!.redirectHops).toBe(2)
  })

  it('reports a missing sitemap, redirect loops, off-site canonicals and mixed content', async () => {
    const { fetch } = fakeSite({
      [`${O}/`]: {
        status: 200,
        html: page('Home page title', '<a href="/loop-a">l</a><img src="http://cdn.test/x.png">', '<link rel="canonical" href="https://elsewhere.test/">'),
      },
      [`${O}/loop-a`]: { status: 301, location: '/loop-b' },
      [`${O}/loop-b`]: { status: 301, location: '/loop-a' },
    })
    const result = await crawlSite(`${O}/`, { fetch, delayMs: 0 })
    const found = codes(result.issues)
    expect(found).toContain('sitemap_missing:/sitemap.xml')
    expect(found).toContain('redirect_loop:/loop-a')
    expect(found).toContain('canonical_offsite:/')
  })

  it('stops at the page cap', async () => {
    const links = Array.from({ length: 50 }, (_, i) => `<a href="/p${i}">p</a>`).join('')
    const routes: Record<string, Route> = { [`${O}/`]: { status: 200, html: page('Home page title', links) } }
    for (let i = 0; i < 50; i++) routes[`${O}/p${i}`] = { status: 200, html: page(`Page number ${i}`) }
    const { fetch } = fakeSite(routes)
    const result = await crawlSite(`${O}/`, { fetch, delayMs: 0, maxPages: 10 })
    expect(result.pages).toHaveLength(10)
  })
})

describe('newErrorCodes', () => {
  const issue = (code: SeoIssue['code'], severity: SeoIssue['severity'] = 'error'): SeoIssue => ({
    code,
    severity,
    url: `${O}/`,
    detail: null,
    sourceUrl: null,
  })

  it('returns error codes whose count rose, ignoring warnings', () => {
    const prev = [issue('broken_link')]
    const cur = [issue('broken_link'), issue('broken_link'), issue('sitemap_noindex'), issue('redirect_chain', 'warn')]
    expect(newErrorCodes(prev, cur)).toEqual(['broken_link', 'sitemap_noindex'])
    expect(newErrorCodes(cur, prev)).toEqual([])
  })
})
