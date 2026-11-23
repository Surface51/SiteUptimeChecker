import type { SeoIssue, SeoIssueCode, SeoSeverity } from '#shared/types'
import type { CrawlInput, CrawledPage } from './crawler'
import { hasNoindex } from './parse'

export const SEO_ISSUE_SEVERITY: Record<SeoIssueCode, SeoSeverity> = {
  http_error: 'error',
  broken_link: 'error',
  redirect_loop: 'error',
  redirect_chain: 'warn',
  title_missing: 'error',
  title_length: 'info',
  title_duplicate: 'warn',
  description_missing: 'warn',
  description_length: 'info',
  description_duplicate: 'info',
  h1_missing: 'warn',
  h1_multiple: 'info',
  sitemap_non_200: 'error',
  sitemap_noindex: 'error',
  sitemap_canonicalised: 'warn',
  sitemap_blocked: 'error',
  sitemap_missing: 'warn',
  canonical_broken: 'error',
  canonical_offsite: 'warn',
  hreflang_no_return: 'warn',
  jsonld_invalid: 'warn',
  mixed_content: 'warn',
  noindex: 'info',
}

const TITLE_MIN = 10
const TITLE_MAX = 60
const DESC_MIN = 50
const DESC_MAX = 160

const isOk = (p: CrawledPage | undefined) => !!p && p.status !== null && p.status >= 200 && p.status < 300
const isRedirect = (p: CrawledPage) => p.status !== null && p.status >= 300 && p.status < 400
const isBroken = (p: CrawledPage) => !p.blockedByRobots && !isRedirect(p) && !isOk(p)

function describeStatus(p: CrawledPage): string {
  return p.status !== null ? `HTTP ${p.status}` : p.error || 'no response'
}

/** Pure: every rule over one crawl's pages. Order is stable (rule, then page order). */
export function evaluateCrawl(input: CrawlInput): SeoIssue[] {
  const { origin, pages, sitemapFound } = input
  const byUrl = new Map(pages.map((p) => [p.url, p]))
  const issues: SeoIssue[] = []
  const add = (
    code: SeoIssueCode,
    url: string,
    detail: string | null = null,
    sourceUrl: string | null = null,
    severity: SeoSeverity = SEO_ISSUE_SEVERITY[code],
  ) => issues.push({ code, severity, url, detail, sourceUrl })

  if (!sitemapFound) add('sitemap_missing', new URL('/sitemap.xml', origin).toString(), 'No sitemap found in robots.txt or at /sitemap.xml')

  // --- Links pointing at broken pages: one issue per target, not per linking page. ---
  const inbound = new Map<string, string[]>()
  for (const p of pages) {
    for (const l of p.links) {
      const list = inbound.get(l)
      if (list) list.push(p.url)
      else inbound.set(l, [p.url])
    }
  }
  for (const p of pages) {
    if (!isBroken(p)) continue
    const sources = inbound.get(p.url)
    if (p.inSitemap) {
      add('sitemap_non_200', p.url, describeStatus(p))
    } else if (sources?.length) {
      const more = sources.length > 1 ? ` — linked from ${sources.length} pages` : ''
      add('broken_link', p.url, `${describeStatus(p)}${more}`, sources[0]!)
    } else {
      add('http_error', p.url, describeStatus(p))
    }
  }

  // --- Redirects ---
  for (const p of pages) {
    if (!p.location) continue
    const path = [p.url]
    let cur: CrawledPage | undefined = p
    let loop = false
    while (cur?.location) {
      if (path.includes(cur.location)) {
        loop = true
        break
      }
      path.push(cur.location)
      cur = byUrl.get(cur.location)
      if (path.length > 11) break
    }
    if (loop) add('redirect_loop', p.url, path.join(' → '))
    else if (path.length > 2) add('redirect_chain', p.url, `${path.length - 1} hops: ${path.join(' → ')}`)
    // A sitemap should list final URLs; a redirect there is wasteful rather than broken.
    if (p.inSitemap && !loop) add('sitemap_non_200', p.url, `${describeStatus(p)} → ${p.location}`, null, 'warn')
  }

  // --- Sitemap hygiene for URLs that did load ---
  for (const p of pages) {
    if (!p.inSitemap) continue
    if (p.blockedByRobots) add('sitemap_blocked', p.url, 'Listed in the sitemap but disallowed for Googlebot by robots.txt')
    if (!isOk(p) || !p.isHtml) continue
    if (hasNoindex(p.robots)) add('sitemap_noindex', p.url, `robots: ${p.robots}`)
    else if (p.canonical && p.canonical !== p.url) add('sitemap_canonicalised', p.url, `canonical → ${p.canonical}`)
  }

  // --- On-page checks, for pages that could actually be indexed ---
  const indexable = pages.filter(
    (p) => isOk(p) && p.isHtml && !hasNoindex(p.robots) && (!p.canonical || p.canonical === p.url),
  )

  for (const p of pages) {
    if (isOk(p) && p.isHtml && hasNoindex(p.robots) && !p.inSitemap) add('noindex', p.url, `robots: ${p.robots}`)
  }

  const titleGroups = new Map<string, CrawledPage[]>()
  const descGroups = new Map<string, CrawledPage[]>()
  for (const p of indexable) {
    if (!p.title) add('title_missing', p.url)
    else {
      if (p.title.length < TITLE_MIN || p.title.length > TITLE_MAX) {
        add('title_length', p.url, `${p.title.length} characters (aim for ${TITLE_MIN}–${TITLE_MAX})`)
      }
      const key = p.title.toLowerCase()
      titleGroups.set(key, [...(titleGroups.get(key) ?? []), p])
    }
    if (!p.description) add('description_missing', p.url)
    else {
      if (p.description.length < DESC_MIN || p.description.length > DESC_MAX) {
        add('description_length', p.url, `${p.description.length} characters (aim for ${DESC_MIN}–${DESC_MAX})`)
      }
      const key = p.description.toLowerCase()
      descGroups.set(key, [...(descGroups.get(key) ?? []), p])
    }
    if (p.h1Count === 0) add('h1_missing', p.url)
    else if (p.h1Count > 1) add('h1_multiple', p.url, `${p.h1Count} <h1> elements`)
    if (p.jsonLdInvalid > 0) add('jsonld_invalid', p.url, `${p.jsonLdInvalid} JSON-LD block${p.jsonLdInvalid === 1 ? '' : 's'} failed to parse`)
    if (p.mixedContent.length) {
      const more = p.mixedContent.length > 1 ? ` (+${p.mixedContent.length - 1} more)` : ''
      add('mixed_content', p.url, `${p.mixedContent[0]}${more}`)
    }
  }
  for (const group of titleGroups.values()) {
    if (group.length < 2) continue
    for (const p of group) add('title_duplicate', p.url, `"${p.title}" — shared by ${group.length} pages`)
  }
  for (const group of descGroups.values()) {
    if (group.length < 2) continue
    for (const p of group) add('description_duplicate', p.url, `Shared by ${group.length} pages`)
  }

  // --- Canonicals ---
  for (const p of pages) {
    if (!isOk(p) || !p.isHtml || !p.canonical || p.canonical === p.url) continue
    const target = new URL(p.canonical)
    if (target.host !== origin.host) {
      add('canonical_offsite', p.url, `canonical → ${p.canonical}`)
      continue
    }
    const t = byUrl.get(p.canonical)
    if (t && t.status !== null && !isOk(t)) add('canonical_broken', p.url, `canonical → ${p.canonical} (${describeStatus(t)})`)
  }

  // --- hreflang reciprocity (only between pages we actually crawled) ---
  for (const p of indexable) {
    for (const alt of p.hreflang) {
      if (alt.href === p.url) continue
      const other = byUrl.get(alt.href)
      if (!other || !isOk(other) || !other.isHtml) continue
      if (!other.hreflang.some((h) => h.href === p.url)) {
        add('hreflang_no_return', p.url, `${alt.lang} → ${alt.href} doesn't link back`)
      }
    }
  }

  return issues
}
