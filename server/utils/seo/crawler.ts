import type { SeoIssue, SeoPage } from '#shared/types'
import { defaultSeoFetch, fetchFollowing, type SeoFetch } from './fetch'
import {
  combineRobots,
  extractHead,
  extractLinks,
  extractMixedContent,
  headerRobots,
  isBlocked,
  normalizePageUrl,
  parseRobots,
  parseSitemap,
  type HreflangLink,
  type RobotsTxt,
} from './parse'
import { evaluateCrawl } from './rules'

/** Everything the rules need about one fetched URL. Only the `SeoPage` subset is persisted. */
export interface CrawledPage {
  url: string
  status: number | null
  error: string | null
  location: string | null
  responseMs: number | null
  isHtml: boolean
  title: string | null
  description: string | null
  canonical: string | null
  robots: string | null
  h1Count: number
  hreflang: HreflangLink[]
  jsonLdInvalid: number
  mixedContent: string[]
  links: string[]
  inSitemap: boolean
  /** Link distance from the homepage; sitemap-only URLs count as 1. */
  depth: number
  /** Skipped (not fetched) because robots.txt disallows it for Googlebot. */
  blockedByRobots: boolean
}

export interface CrawlInput {
  origin: URL
  pages: CrawledPage[]
  sitemapUrls: Set<string>
  sitemapFound: boolean
  robots: RobotsTxt | null
}

export interface CrawlResult {
  pages: SeoPage[]
  issues: SeoIssue[]
  sitemapUrls: number
  error: string | null
}

export interface CrawlOptions {
  fetch?: SeoFetch
  maxPages?: number
  concurrency?: number
  /** Pause each worker takes between requests, to stay polite. */
  delayMs?: number
  onProgress?: (pagesCrawled: number) => void
}

const MAX_SITEMAP_FILES = 50
const MAX_REDIRECT_FOLLOW = 10
// Links to these are assets, not pages — fetching them wastes the page budget.
const ASSET_EXT = /\.(?:jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|gz|tgz|rar|7z|mp[34]|m4[av]|mov|avi|webm|woff2?|ttf|eot|css|js|json|xml|txt|docx?|xlsx?|pptx?)$/i

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isInteger(n) && n > 0 ? n : fallback
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function loadRobots(origin: URL, fetchFn: SeoFetch): Promise<RobotsTxt | null> {
  const res = await fetchFollowing(new URL('/robots.txt', origin).toString(), fetchFn)
  if (res.status < 200 || res.status >= 300 || !res.body) return null
  return parseRobots(res.body.toString('utf-8'))
}

/** Walk sitemap indexes breadth-first; returns same-host page URLs, capped at `limit`. */
async function loadSitemaps(
  origin: URL,
  seeds: string[],
  fetchFn: SeoFetch,
  limit: number,
): Promise<{ urls: string[]; found: boolean }> {
  const queue = [...seeds]
  const seenFiles = new Set<string>()
  const urls = new Set<string>()
  let found = false
  while (queue.length && seenFiles.size < MAX_SITEMAP_FILES && urls.size < limit) {
    const file = queue.shift()!
    if (seenFiles.has(file)) continue
    seenFiles.add(file)
    // Sitemaps commonly sit behind one redirect (http→https, /sitemap.xml → /sitemap_index.xml).
    const res = await fetchFollowing(file, fetchFn, 3)
    if (res.status < 200 || res.status >= 300 || !res.body) continue
    let parsed
    try {
      parsed = parseSitemap(res.body)
    } catch {
      continue
    }
    if (!parsed.locs.length && !/<(urlset|sitemapindex)[\s>]/i.test(res.body.toString('utf-8', 0, 2048))) continue
    found = true
    for (const loc of parsed.locs) {
      let abs: string
      try {
        abs = normalizePageUrl(new URL(loc, file).toString())
      } catch {
        continue
      }
      if (parsed.kind === 'index') queue.push(abs)
      else if (new URL(abs).host === origin.host && urls.size < limit) urls.add(abs)
    }
  }
  return { urls: [...urls], found }
}

function emptyPage(url: string, depth: number, inSitemap: boolean): CrawledPage {
  return {
    url,
    status: null,
    error: null,
    location: null,
    responseMs: null,
    isHtml: false,
    title: null,
    description: null,
    canonical: null,
    robots: null,
    h1Count: 0,
    hreflang: [],
    jsonLdInvalid: 0,
    mixedContent: [],
    links: [],
    inSitemap,
    depth,
    blockedByRobots: false,
  }
}

/**
 * Crawl one site: robots.txt → sitemaps → BFS from the homepage plus every sitemap URL, then run
 * the issue rules over what was found. Redirects are recorded hop by hop (each hop is a page) so
 * chains and loops are visible; off-host targets are never fetched.
 */
export async function crawlSite(siteUrl: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const fetchFn = opts.fetch ?? defaultSeoFetch
  const maxPages = opts.maxPages ?? envInt('UPTIME_SEO_MAX_PAGES', 500)
  const concurrency = opts.concurrency ?? 4
  const delayMs = opts.delayMs ?? 250

  const start = new URL(siteUrl)
  const origin = new URL(start.origin)
  const homepage = normalizePageUrl(start.toString())

  const robots = await loadRobots(origin, fetchFn)
  const sitemapSeeds = robots?.sitemaps.length ? robots.sitemaps : [new URL('/sitemap.xml', origin).toString()]
  const sitemap = await loadSitemaps(origin, sitemapSeeds, fetchFn, maxPages * 4)
  const sitemapUrls = new Set(sitemap.urls)

  const pages = new Map<string, CrawledPage>()
  const queue: { url: string; depth: number }[] = []
  const enqueue = (url: string, depth: number) => {
    if (pages.has(url) || pages.size >= maxPages) return
    pages.set(url, emptyPage(url, depth, sitemapUrls.has(url)))
    queue.push({ url, depth })
  }
  enqueue(homepage, 0)
  for (const u of sitemap.urls) enqueue(u, 1)

  let done = 0
  async function visit(url: string, depth: number) {
    const page = pages.get(url)!
    const path = new URL(url).pathname + new URL(url).search
    if (robots && isBlocked(robots, path, 'googlebot')) {
      page.blockedByRobots = true
      return
    }
    const res = await fetchFn(url)
    page.status = res.status === 0 ? null : res.status
    page.error = res.error
    page.responseMs = res.timeMs

    if (res.status >= 300 && res.status < 400 && res.location) {
      try {
        page.location = normalizePageUrl(new URL(res.location, url).toString())
      } catch {
        page.location = null
      }
      if (page.location && new URL(page.location).host === origin.host) enqueue(page.location, depth)
      return
    }

    const ct = res.headers['content-type'] || ''
    if (res.status < 200 || res.status >= 300 || !res.body || !/html/i.test(ct)) return
    const html = res.body.toString('utf-8')
    const head = extractHead(html, url)
    page.isHtml = true
    page.title = head.title
    page.description = head.description
    page.canonical = head.canonical
    page.robots = combineRobots(head.metaRobots, headerRobots(res.headers['x-robots-tag']))
    page.h1Count = head.h1Count
    page.hreflang = head.hreflang
    page.jsonLdInvalid = head.jsonLd.invalid
    page.mixedContent = extractMixedContent(html, url)
    page.links = extractLinks(html, url)
    for (const link of page.links) {
      if (!ASSET_EXT.test(new URL(link).pathname)) enqueue(link, depth + 1)
    }
  }

  async function worker() {
    while (queue.length) {
      const next = queue.shift()!
      try {
        await visit(next.url, next.depth)
      } catch (err) {
        const page = pages.get(next.url)!
        page.error = (err as Error)?.message || 'Crawl failed'
      }
      done++
      opts.onProgress?.(done)
      if (delayMs) await sleep(delayMs)
    }
  }

  // A worker exits as soon as it sees an empty queue, even if a sibling is mid-fetch and about to
  // enqueue more links — so after every round settles, start another while work remains.
  while (queue.length) {
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  }

  const crawled = [...pages.values()]
  const issues = evaluateCrawl({
    origin,
    pages: crawled,
    sitemapUrls,
    sitemapFound: sitemap.found,
    robots,
  })

  const hops = redirectHopCounts(crawled)
  return {
    pages: crawled.map((p) => ({
      url: p.url,
      status: p.status,
      redirectHops: hops.get(p.url) ?? 0,
      responseMs: p.responseMs,
      title: p.title,
      description: p.description,
      canonical: p.canonical,
      robots: p.robots,
      h1Count: p.h1Count,
      inSitemap: p.inSitemap,
      depth: p.depth,
    })),
    issues,
    sitemapUrls: sitemapUrls.size,
    error: null,
  }
}

/** For each redirecting page, how many hops until a non-redirect (or an off-host/unfetched target). */
export function redirectHopCounts(pages: CrawledPage[]): Map<string, number> {
  const byUrl = new Map(pages.map((p) => [p.url, p]))
  const out = new Map<string, number>()
  for (const p of pages) {
    if (!p.location) continue
    let hops = 0
    let cur: CrawledPage | undefined = p
    const seen = new Set<string>()
    while (cur?.location && hops < MAX_REDIRECT_FOLLOW && !seen.has(cur.url)) {
      seen.add(cur.url)
      hops++
      cur = byUrl.get(cur.location)
    }
    out.set(p.url, hops)
  }
  return out
}
