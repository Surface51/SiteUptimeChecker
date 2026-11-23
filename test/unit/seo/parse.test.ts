import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  blocksRoot,
  combineRobots,
  extractHead,
  extractLinks,
  extractMixedContent,
  hasNoindex,
  headerRobots,
  isBlocked,
  parseRobots,
  parseSitemap,
} from '../../../server/utils/seo/parse'

describe('extractHead', () => {
  const html = `<!doctype html><html><head>
    <title>  Hello   World </title>
    <meta name="description" content="A page about things">
    <meta name="ROBOTS" content="NOINDEX, follow">
    <link rel="canonical" href="/canonical-page#frag">
    <link rel="alternate" hreflang="fr" href="https://example.test/fr/">
    <meta property="og:title" content="OG title">
    <script type="application/ld+json">{"@type":"Organization"}</script>
    <script type="application/ld+json">{broken</script>
  </head><body><h1>One</h1><h1>Two</h1></body></html>`

  it('reads title, description, robots, canonical, hreflang, h1s, JSON-LD and og tags', () => {
    const head = extractHead(html, 'https://example.test/page')
    expect(head.title).toBe('Hello World')
    expect(head.description).toBe('A page about things')
    expect(head.metaRobots).toBe('noindex,follow')
    expect(head.canonical).toBe('https://example.test/canonical-page')
    expect(head.hreflang).toEqual([{ lang: 'fr', href: 'https://example.test/fr/' }])
    expect(head.h1Count).toBe(2)
    expect(head.jsonLd).toEqual({ valid: 1, invalid: 1 })
    expect(head.og['og:title']).toBe('OG title')
  })

  it('returns nulls for a bare page', () => {
    const head = extractHead('<html><body>hi</body></html>', 'https://example.test/')
    expect(head).toMatchObject({ title: null, description: null, metaRobots: null, canonical: null, h1Count: 0 })
  })
})

describe('robots directives', () => {
  it('keeps unprefixed and googlebot-prefixed header directives, ignores other bots', () => {
    expect(headerRobots('noindex, nofollow')).toBe('noindex,nofollow')
    expect(headerRobots('googlebot: noindex')).toBe('noindex')
    expect(headerRobots('bingbot: noindex')).toBeNull()
    expect(headerRobots('bingbot: noindex, googlebot: nofollow')).toBe('nofollow')
    expect(headerRobots('max-snippet:-1, noarchive')).toBe('max-snippet:-1,noarchive')
  })

  it('merges meta and header directives and detects noindex/none', () => {
    expect(combineRobots('index', 'noindex')).toBe('index,noindex')
    expect(combineRobots(null, null)).toBeNull()
    expect(hasNoindex('index,noindex')).toBe(true)
    expect(hasNoindex('none')).toBe(true)
    expect(hasNoindex('index,follow')).toBe(false)
    expect(hasNoindex(null)).toBe(false)
  })
})

describe('extractLinks / extractMixedContent', () => {
  it('returns same-host links only, without fragments or non-http schemes', () => {
    const html = `<a href="/a">a</a><a href="/a#x">dup</a><a href="https://other.test/">x</a>
      <a href="mailto:me@example.test">m</a><a href="b?q=1">b</a>`
    expect(extractLinks(html, 'https://example.test/dir/')).toEqual([
      'https://example.test/a',
      'https://example.test/dir/b?q=1',
    ])
  })

  it('flags http subresources on https pages only', () => {
    const html = `<img src="http://cdn.test/a.png"><script src="https://cdn.test/a.js"></script>
      <link rel="stylesheet" href="http://cdn.test/a.css"><a href="http://x.test/">link is fine</a>`
    expect(extractMixedContent(html, 'https://example.test/')).toEqual(['http://cdn.test/a.png', 'http://cdn.test/a.css'])
    expect(extractMixedContent(html, 'http://example.test/')).toEqual([])
  })
})

describe('robots.txt', () => {
  it('blocks the root for a wildcard Disallow: /', () => {
    expect(blocksRoot(parseRobots('User-agent: *\nDisallow: /'))).toBe(true)
  })

  it('treats an empty Disallow as allow-all', () => {
    expect(blocksRoot(parseRobots('User-agent: *\nDisallow:'))).toBe(false)
  })

  it('prefers the googlebot group over *', () => {
    const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n')
    expect(isBlocked(r, '/', 'googlebot')).toBe(false)
    expect(isBlocked(r, '/', 'somebot')).toBe(true)
  })

  it('applies longest match, with ties going to Allow, and supports * and $', () => {
    const r = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$\n')
    expect(isBlocked(r, '/private/x')).toBe(true)
    expect(isBlocked(r, '/private/public/page')).toBe(false)
    expect(isBlocked(r, '/files/doc.pdf')).toBe(true)
    expect(isBlocked(r, '/files/doc.pdf?x=1')).toBe(false)
  })

  it('groups consecutive user-agent lines and collects sitemaps', () => {
    const r = parseRobots('# hi\nUser-agent: a\nUser-agent: b\nDisallow: /x\nSitemap: https://example.test/s.xml\n')
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0]!.agents).toEqual(['a', 'b'])
    expect(r.sitemaps).toEqual(['https://example.test/s.xml'])
  })
})

describe('parseSitemap', () => {
  it('parses a urlset and decodes entities', () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://example.test/a?x=1&amp;y=2</loc></url>
      <url><loc><![CDATA[https://example.test/b]]></loc></url></urlset>`
    expect(parseSitemap(xml)).toEqual({ kind: 'urlset', locs: ['https://example.test/a?x=1&y=2', 'https://example.test/b'] })
  })

  it('recognises a sitemap index', () => {
    const xml = `<sitemapindex><sitemap><loc>https://example.test/s1.xml</loc></sitemap></sitemapindex>`
    expect(parseSitemap(xml).kind).toBe('index')
  })

  it('gunzips a gzipped body', () => {
    const gz = gzipSync(Buffer.from('<urlset><url><loc>https://example.test/</loc></url></urlset>'))
    expect(parseSitemap(gz).locs).toEqual(['https://example.test/'])
  })
})
