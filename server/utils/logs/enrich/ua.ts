// ua-parser-js ships no type declarations and resolves to a plain JS source file.
// @ts-expect-error untyped module
import { UAParser } from 'ua-parser-js'
import { isbot } from 'isbot'
import { BoundedCache } from '../boundedCache'
// crawler-user-agents ships as CommonJS JSON; entries look like:
// { pattern: "Googlebot\\/", description: "...", tags: ["search-engine"], ... }
import crawlerList from 'crawler-user-agents'

export interface UaInfo {
  browser: string | null
  os: string | null
  device: string | null
  isBot: boolean
  botName: string | null
}

interface CrawlerEntry {
  pattern: string
  description?: string
  tags?: string[]
}

const CRAWLER_PATTERNS = (crawlerList as CrawlerEntry[])
  .map((entry) => {
    try {
      return { re: new RegExp(entry.pattern), name: entry.description || entry.pattern }
    } catch {
      return null
    }
  })
  .filter((x): x is { re: RegExp; name: string } => x !== null)

// A single combined alternation as a cheap pre-filter: most UAs (real browsers) fail this one
// test and skip the expensive per-pattern loop below entirely (avoids ~1500 regex tests each).
const QUICK_REJECT_RE = new RegExp(CRAWLER_PATTERNS.map(({ re }) => `(?:${re.source})`).join('|'))

function detectCrawlerName(ua: string): string | null {
  if (!QUICK_REJECT_RE.test(ua)) return null
  for (const { re, name } of CRAWLER_PATTERNS) {
    if (re.test(ua)) return name
  }
  return null
}

const cache = new BoundedCache<string, UaInfo>(10_000)

export function enrichUserAgent(ua: string): UaInfo {
  const existing = cache.get(ua)
  if (existing) return existing

  let info: UaInfo
  if (!ua) {
    info = { browser: null, os: null, device: null, isBot: false, botName: null }
  } else {
    const parsed = new UAParser(ua).getResult()
    const crawlerName = detectCrawlerName(ua)
    info = {
      browser: parsed.browser.name ?? null,
      os: parsed.os.name ?? null,
      device: parsed.device.type ?? null,
      isBot: isbot(ua) || crawlerName !== null,
      botName: crawlerName
    }
  }

  cache.set(ua, info)
  return info
}

/** Called after an ingest run: this cache only earns its keep during ingestion. */
export function clearUaCache(): void {
  cache.clear()
}
