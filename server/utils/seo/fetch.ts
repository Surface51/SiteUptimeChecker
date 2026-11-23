import { MONITOR_HEADERS } from '../checks/httpCheck'

export interface SeoFetchResult {
  /** 0 when the request never got a response (DNS failure, refused, timeout). */
  status: number
  headers: Record<string, string>
  /** Raw bytes for HTML/XML/text responses (capped); null for anything else or on error. */
  body: Buffer | null
  location: string | null
  timeMs: number
  error: string | null
}

export type SeoFetch = (url: string) => Promise<SeoFetchResult>

const TIMEOUT_MS = 15_000
const MAX_BODY_BYTES = 5 * 1024 * 1024

function wantsBody(contentType: string): boolean {
  return /html|xml|text\/plain|gzip|octet-stream/i.test(contentType)
}

async function readCapped(res: Response): Promise<Buffer | null> {
  if (!res.body) return null
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
    if (total >= MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {})
      break
    }
  }
  return Buffer.concat(chunks).subarray(0, MAX_BODY_BYTES)
}

/**
 * One request, redirects *not* followed — the crawler records each hop as its own page so it can
 * see chains and loops. Sent with the monitor's identifying headers so it allow-lists the same way
 * uptime checks do.
 */
export const defaultSeoFetch: SeoFetch = async (url) => {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { ...MONITOR_HEADERS, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      redirect: 'manual',
      signal: controller.signal,
    })
    const headers: Record<string, string> = {}
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v
    })
    const ct = headers['content-type'] || ''
    const body = res.status >= 200 && res.status < 300 && wantsBody(ct) ? await readCapped(res) : null
    if (!body) await res.body?.cancel().catch(() => {})
    return {
      status: res.status,
      headers,
      body,
      location: headers.location ?? null,
      timeMs: Date.now() - started,
      error: null,
    }
  } catch (err) {
    const message = controller.signal.aborted ? 'Timed out' : (err as Error)?.message || 'Request failed'
    return { status: 0, headers: {}, body: null, location: null, timeMs: Date.now() - started, error: message }
  } finally {
    clearTimeout(timer)
  }
}

/** Follow up to `maxHops` redirects — for robots.txt and sitemaps, which often sit behind one. */
export async function fetchFollowing(url: string, fetchFn: SeoFetch, maxHops = 5): Promise<SeoFetchResult & { finalUrl: string }> {
  let current = url
  let res = await fetchFn(current)
  for (let hop = 0; res.status >= 300 && res.status < 400 && res.location && hop < maxHops; hop++) {
    try {
      current = new URL(res.location, current).toString()
    } catch {
      break
    }
    res = await fetchFn(current)
  }
  return { ...res, finalUrl: current }
}
