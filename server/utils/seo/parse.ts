import { gunzipSync } from 'node:zlib'
import { parse as parseHtml, type HTMLElement } from 'node-html-parser'

// Pure parsing helpers for the SEO guards and crawler — no I/O, so they're unit-tested directly.

export interface HreflangLink {
  lang: string
  href: string
}

export interface PageHead {
  title: string | null
  description: string | null
  /** Meta robots / googlebot directives, lowercased and comma-joined; null when absent. */
  metaRobots: string | null
  /** Absolute canonical URL (resolved against the page URL), or null. */
  canonical: string | null
  hreflang: HreflangLink[]
  h1Count: number
  jsonLd: { valid: number; invalid: number }
  og: Record<string, string>
}

function clean(text: string | undefined | null): string | null {
  if (text == null) return null
  const s = text.replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

function resolveUrl(href: string | undefined | null, base: string): string | null {
  if (!href) return null
  try {
    return normalizePageUrl(new URL(href.trim(), base).toString())
  } catch {
    return null
  }
}

/** Canonical form used as a map key everywhere: no fragment, lowercased host (URL does that). */
export function normalizePageUrl(raw: string): string {
  const u = new URL(raw)
  u.hash = ''
  return u.toString()
}

function root(html: string): HTMLElement {
  return parseHtml(html, { lowerCaseTagName: true, comment: false })
}

export function extractHead(html: string, pageUrl: string): PageHead {
  const doc = root(html)

  const metaContent = (name: string): string | null => {
    const el = doc.querySelectorAll('meta').find((m) => (m.getAttribute('name') || '').toLowerCase() === name)
    return clean(el?.getAttribute('content'))
  }

  const robotsParts = [metaContent('robots'), metaContent('googlebot')].filter((x): x is string => !!x)
  const metaRobots = robotsParts.length ? normalizeDirectives(robotsParts.join(',')) : null

  const canonicalEl = doc
    .querySelectorAll('link')
    .find((l) => (l.getAttribute('rel') || '').toLowerCase().split(/\s+/).includes('canonical'))

  const hreflang: HreflangLink[] = []
  for (const l of doc.querySelectorAll('link')) {
    const rel = (l.getAttribute('rel') || '').toLowerCase().split(/\s+/)
    const lang = l.getAttribute('hreflang')
    if (!rel.includes('alternate') || !lang) continue
    const href = resolveUrl(l.getAttribute('href'), pageUrl)
    if (href) hreflang.push({ lang: lang.toLowerCase(), href })
  }

  let valid = 0
  let invalid = 0
  for (const s of doc.querySelectorAll('script')) {
    if ((s.getAttribute('type') || '').toLowerCase() !== 'application/ld+json') continue
    try {
      JSON.parse(s.rawText)
      valid++
    } catch {
      invalid++
    }
  }

  const og: Record<string, string> = {}
  for (const m of doc.querySelectorAll('meta')) {
    const prop = (m.getAttribute('property') || '').toLowerCase()
    const content = clean(m.getAttribute('content'))
    if (prop.startsWith('og:') && content) og[prop] = content
  }

  return {
    title: clean(doc.querySelector('title')?.text),
    description: metaContent('description'),
    metaRobots,
    canonical: resolveUrl(canonicalEl?.getAttribute('href'), pageUrl),
    hreflang,
    h1Count: doc.querySelectorAll('h1').length,
    jsonLd: { valid, invalid },
    og,
  }
}

/** Lowercase, de-duplicate and comma-join robots directives ("NOINDEX, follow" → "noindex,follow"). */
export function normalizeDirectives(raw: string): string {
  const seen = new Set<string>()
  for (const part of raw.toLowerCase().split(',')) {
    const d = part.trim()
    if (d) seen.add(d)
  }
  return [...seen].join(',')
}

/**
 * Directives from an `X-Robots-Tag` header that apply to Google: unprefixed ones, and ones
 * prefixed `googlebot:`. Ones aimed at another bot ("bingbot: noindex") are ignored.
 */
export function headerRobots(value: string | null | undefined): string | null {
  if (!value) return null
  const out: string[] = []
  // Tokens after a "<bot>:" prefix belong to that bot until the next prefix. Directives that
  // carry their own colon ("max-snippet:-1", "unavailable_after: <date>") are not prefixes.
  let bot: string | null = null
  for (const raw of value.split(/[,\n]/)) {
    let token = raw.trim()
    if (!token) continue
    const m = /^([a-z][a-z0-9_-]*)\s*:\s*(.*)$/i.exec(token)
    if (m && !VALUED_DIRECTIVES.has(m[1]!.toLowerCase())) {
      bot = m[1]!.toLowerCase()
      token = m[2]!.trim()
      if (!token) continue
    }
    if (bot === null || bot === 'googlebot') out.push(token)
  }
  const joined = normalizeDirectives(out.join(','))
  return joined || null
}

const VALUED_DIRECTIVES = new Set(['unavailable_after', 'max-snippet', 'max-image-preview', 'max-video-preview'])

/** Merge meta and header directives into the effective set; null when neither says anything. */
export function combineRobots(meta: string | null, header: string | null): string | null {
  const joined = normalizeDirectives([meta, header].filter(Boolean).join(','))
  return joined || null
}

export function hasNoindex(robots: string | null | undefined): boolean {
  if (!robots) return false
  return robots.split(',').some((d) => d === 'noindex' || d === 'none')
}

/** Same-origin `<a href>` targets, normalised and de-duplicated. */
export function extractLinks(html: string, pageUrl: string): string[] {
  const doc = root(html)
  const base = new URL(pageUrl)
  const baseHref = doc.querySelector('base')?.getAttribute('href')
  const resolveBase = baseHref ? (resolveUrl(baseHref, pageUrl) ?? pageUrl) : pageUrl
  const out = new Set<string>()
  for (const a of doc.querySelectorAll('a')) {
    const href = a.getAttribute('href')
    if (!href || /^(mailto|tel|javascript|data):/i.test(href.trim())) continue
    const abs = resolveUrl(href, resolveBase)
    if (!abs) continue
    const u = new URL(abs)
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.host !== base.host) continue
    out.add(abs)
  }
  return [...out]
}

/** `http://` subresources on an https page — images, scripts, stylesheets, frames, media. */
export function extractMixedContent(html: string, pageUrl: string): string[] {
  if (!pageUrl.startsWith('https:')) return []
  const doc = root(html)
  const out = new Set<string>()
  const check = (v: string | undefined) => {
    if (v && /^http:\/\//i.test(v.trim())) out.add(v.trim())
  }
  for (const el of doc.querySelectorAll('img, script, iframe, source, video, audio, embed')) {
    check(el.getAttribute('src'))
  }
  for (const el of doc.querySelectorAll('link')) {
    if ((el.getAttribute('rel') || '').toLowerCase().includes('stylesheet')) check(el.getAttribute('href'))
  }
  return [...out]
}

// ---------- robots.txt ----------

interface RobotsRule {
  allow: boolean
  path: string
}

export interface RobotsTxt {
  groups: { agents: string[]; rules: RobotsRule[] }[]
  sitemaps: string[]
}

export function parseRobots(text: string): RobotsTxt {
  const groups: RobotsTxt['groups'] = []
  const sitemaps: string[] = []
  let current: RobotsTxt['groups'][number] | null = null
  let lastWasAgent = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()

    if (key === 'user-agent') {
      // Consecutive user-agent lines share one group.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (key === 'sitemap') {
      if (value) sitemaps.push(value)
    } else if ((key === 'allow' || key === 'disallow') && current) {
      // An empty Disallow means "allow everything" — no rule to record.
      if (value) current.rules.push({ allow: key === 'allow', path: value })
    }
  }
  return { groups, sitemaps }
}

/** Google's group selection: the group naming the most specific matching agent, else `*`. */
function groupFor(robots: RobotsTxt, ua: string): RobotsRule[] {
  const agent = ua.toLowerCase()
  let best: { len: number; rules: RobotsRule[] } | null = null
  const merged: RobotsRule[] = []
  for (const g of robots.groups) {
    for (const a of g.agents) {
      if (a === '*' || !agent.startsWith(a)) continue
      if (!best || a.length > best.len) best = { len: a.length, rules: [...g.rules] }
      else if (a.length === best.len) best.rules.push(...g.rules)
    }
  }
  if (best) return best.rules
  for (const g of robots.groups) if (g.agents.includes('*')) merged.push(...g.rules)
  return merged
}

function ruleMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const re = new RegExp(
    '^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''),
  )
  return re.test(path)
}

/** Longest matching rule wins; a tie goes to Allow (RFC 9309). */
export function isBlocked(robots: RobotsTxt, path: string, ua = 'googlebot'): boolean {
  let best: RobotsRule | null = null
  for (const rule of groupFor(robots, ua)) {
    if (!ruleMatches(rule.path, path)) continue
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
      best = rule
    }
  }
  return !!best && !best.allow
}

/** True when robots.txt shuts Google (or every crawler) out of the homepage. */
export function blocksRoot(robots: RobotsTxt): boolean {
  return isBlocked(robots, '/', 'googlebot') || isBlocked(robots, '/', '*')
}

// ---------- sitemaps ----------

export interface ParsedSitemap {
  kind: 'urlset' | 'index'
  locs: string[]
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

/** Accepts the raw bytes so a gzipped sitemap (`.xml.gz`, or any body with the gzip magic) works. */
export function parseSitemap(body: Buffer | string): ParsedSitemap {
  let text: string
  if (Buffer.isBuffer(body)) {
    text = body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body).toString('utf-8') : body.toString('utf-8')
  } else {
    text = body
  }
  const kind = /<sitemapindex[\s>]/i.test(text) ? 'index' : 'urlset'
  const locs: string[] = []
  const re = /<loc>([\s\S]*?)<\/loc>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const loc = decodeXml(m[1]!)
    if (loc) locs.push(loc)
  }
  return { kind, locs }
}
