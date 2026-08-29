import http from 'node:http'
import https from 'node:https'
import type { TLSSocket } from 'node:tls'
import type { RedirectHop } from '#shared/types'
import type { SslInfo } from './sslCheck'

export interface HttpCheckResult {
  finalUrl: string
  httpStatus: number | null
  error: string | null
  timeDns: number | null
  timeTcp: number | null
  timeTls: number | null
  timeTtfb: number | null
  timeTotal: number | null
  pageTitle: string | null
  contentLength: number | null
  contentType: string | null
  redirectChain: RedirectHop[]
  responseHeaders: Record<string, string>
  ssl: SslInfo | null
  /** Decoded prefix of the final response body (up to the scan cap) — for content assertions. */
  bodyText: string | null
}

export interface HttpCheckOptions {
  method?: string
  headers?: Record<string, string> | null
  body?: string | null
  authUser?: string | null
  authPass?: string | null
  timeoutMs?: number
  followRedirects?: boolean
  maxRedirects?: number
  /** How many bytes of the final response body to keep and decode. */
  bodyScanBytes?: number
}

const DEFAULT_MAX_REDIRECTS = 10
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const MAX_BODY_BYTES = 5 * 1024 * 1024
const DEFAULT_SCAN_BYTES = 65_536
const USER_AGENT = 'SiteUptimeChecker/1.0 (+local health monitor)'

function describeError(err: any): string {
  if (err?.message) return err.message
  if (Array.isArray(err?.errors) && err.errors.length) {
    const inner = err.errors.map((e: any) => e?.code || e?.message).filter(Boolean)
    if (inner.length) return `${err.code || 'Request failed'}: ${inner.join(', ')}`
  }
  if (err?.code) return err.code
  return 'Request failed'
}

interface HopResult {
  status: number
  location: string | null
  headers: Record<string, string>
  ssl: SslInfo | null
  timeDns: number | null
  timeTcp: number | null
  timeTls: number | null
  timeTtfb: number | null
  pageTitle: string | null
  contentLength: number | null
  contentType: string | null
  bodyText: string | null
}

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function extractSsl(socket: TLSSocket): SslInfo | null {
  const cert = socket.getPeerCertificate(true)
  if (!cert || !cert.valid_to) return null
  const expiresAt = new Date(cert.valid_to)
  const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000)
  return {
    valid: socket.authorized === true,
    issuer: firstString(cert.issuer?.O) || firstString(cert.issuer?.CN),
    expiresAt: expiresAt.toISOString(),
    daysRemaining,
  }
}

interface ResolvedOptions {
  method: string
  headers: Record<string, string>
  body: string | null
  timeoutMs: number
  scanBytes: number
}

function requestOnce(url: URL, opts: ResolvedOptions): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'http:' ? http : https
    const t0 = performance.now()

    let timeDns: number | null = null
    let timeTcp: number | null = null
    let timeTls: number | null = null
    let sslInfo: SslInfo | null = null

    const req = mod.request(
      url,
      {
        method: opts.method,
        timeout: opts.timeoutMs,
        headers: opts.headers,
      },
      (res) => {
        const timeTtfb = performance.now() - t0

        const headers: Record<string, string> = {}
        for (const [key, value] of Object.entries(res.headers)) {
          if (typeof value === 'string') headers[key] = value
          else if (Array.isArray(value)) headers[key] = value.join(', ')
        }

        const status = res.statusCode ?? 0
        const location = typeof res.headers.location === 'string' ? res.headers.location : null
        const contentType = typeof res.headers['content-type'] === 'string' ? res.headers['content-type'] : null

        let bytes = 0
        const scanChunks: Buffer[] = []
        let scannedBytes = 0

        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (scannedBytes < opts.scanBytes) {
            scanChunks.push(chunk)
            scannedBytes += chunk.length
          }
          if (bytes > MAX_BODY_BYTES) {
            res.destroy()
          }
        })

        res.on('end', () => {
          let bodyText: string | null = null
          let pageTitle: string | null = null
          if (scanChunks.length) {
            bodyText = Buffer.concat(scanChunks).toString('utf-8').slice(0, opts.scanBytes)
            const match = /<title[^>]*>([^<]*)<\/title>/i.exec(bodyText)
            if (match?.[1]) pageTitle = match[1].trim().slice(0, 300) || null
          }

          resolve({
            status,
            location,
            headers,
            ssl: sslInfo,
            timeDns,
            timeTcp,
            timeTls,
            timeTtfb,
            pageTitle,
            contentLength: bytes || (headers['content-length'] ? Number(headers['content-length']) : null),
            contentType,
            bodyText,
          })
        })

        res.on('error', (err) => reject(err))
      },
    )

    req.on('socket', (socket) => {
      socket.once('lookup', () => {
        timeDns = performance.now() - t0
      })
      socket.once('connect', () => {
        timeTcp = performance.now() - t0
      })
      socket.once('secureConnect', () => {
        timeTls = performance.now() - t0
        sslInfo = extractSsl(socket as TLSSocket)
      })
    })

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'))
    })

    req.on('error', (err) => reject(err))

    if (opts.body !== null && opts.method !== 'GET' && opts.method !== 'HEAD') {
      req.write(opts.body)
    }
    req.end()
  })
}

export async function httpCheck(startUrl: URL, options: HttpCheckOptions = {}): Promise<HttpCheckResult> {
  const method = (options.method || 'GET').toUpperCase()
  const followRedirects = options.followRedirects !== false
  const maxRedirects = followRedirects ? options.maxRedirects ?? DEFAULT_MAX_REDIRECTS : 0
  const scanBytes = Math.max(0, options.bodyScanBytes ?? DEFAULT_SCAN_BYTES)

  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'Accept-Encoding': 'identity',
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
  }
  for (const [k, v] of Object.entries(options.headers ?? {})) headers[k] = v
  if (options.authUser) {
    const token = Buffer.from(`${options.authUser}:${options.authPass ?? ''}`).toString('base64')
    headers.Authorization = `Basic ${token}`
  }
  const body = options.body ?? null
  if (body !== null && method !== 'GET' && method !== 'HEAD' && !('content-length' in headerKeysLower(headers))) {
    headers['Content-Length'] = String(Buffer.byteLength(body))
  }

  const resolved: ResolvedOptions = {
    method,
    headers,
    body,
    timeoutMs: options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    scanBytes,
  }

  const overallStart = performance.now()
  const redirectChain: RedirectHop[] = []
  let currentUrl = startUrl
  let ssl: SslInfo | null = null

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let result: HopResult
    try {
      result = await requestOnce(currentUrl, resolved)
    } catch (err: any) {
      return {
        finalUrl: currentUrl.toString(),
        httpStatus: null,
        error: describeError(err),
        timeDns: null,
        timeTcp: null,
        timeTls: null,
        timeTtfb: null,
        timeTotal: performance.now() - overallStart,
        pageTitle: null,
        contentLength: null,
        contentType: null,
        redirectChain,
        responseHeaders: {},
        ssl,
        bodyText: null,
      }
    }

    if (result.ssl && !ssl) ssl = result.ssl

    const isRedirect = result.status >= 300 && result.status < 400 && result.location
    if (followRedirects && isRedirect && hop < maxRedirects) {
      redirectChain.push({ url: currentUrl.toString(), status: result.status })
      currentUrl = new URL(result.location!, currentUrl)
      continue
    }

    return {
      finalUrl: currentUrl.toString(),
      httpStatus: result.status,
      error: null,
      timeDns: result.timeDns,
      timeTcp: result.timeTcp,
      timeTls: result.timeTls,
      timeTtfb: result.timeTtfb,
      timeTotal: performance.now() - overallStart,
      pageTitle: result.pageTitle,
      contentLength: result.contentLength,
      contentType: result.contentType,
      redirectChain,
      responseHeaders: result.headers,
      ssl,
      bodyText: result.bodyText,
    }
  }

  return {
    finalUrl: currentUrl.toString(),
    httpStatus: null,
    error: 'Too many redirects',
    timeDns: null,
    timeTcp: null,
    timeTls: null,
    timeTtfb: null,
    timeTotal: performance.now() - overallStart,
    pageTitle: null,
    contentLength: null,
    contentType: null,
    redirectChain,
    responseHeaders: {},
    ssl,
    bodyText: null,
  }
}

function headerKeysLower(headers: Record<string, string>): Record<string, true> {
  const out: Record<string, true> = {}
  for (const k of Object.keys(headers)) out[k.toLowerCase()] = true
  return out
}
