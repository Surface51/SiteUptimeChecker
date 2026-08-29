import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { httpCheck } from '../../server/utils/checks/httpCheck'

let server: Server
let base: string
const seen: { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body: string }[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body })
      const url = req.url || '/'

      if (url === '/slow') {
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'text/plain' })
          res.end('late')
        }, 300)
        return
      }
      if (url === '/redirect') {
        res.writeHead(302, { location: `${base}/target` })
        res.end()
        return
      }
      if (url === '/target') {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('arrived')
        return
      }
      if (url === '/auth') {
        const ok = req.headers.authorization === `Basic ${Buffer.from('u:p').toString('base64')}`
        res.writeHead(ok ? 200 : 401)
        res.end(ok ? 'welcome' : 'nope')
        return
      }
      if (url === '/big') {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end(`<html><head><title>Shop</title></head><body>${'x'.repeat(5000)}Add to cart</body></html>`)
        return
      }
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><head><title>Home</title></head><body>hello</body></html>')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  base = `http://127.0.0.1:${port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe('httpCheck request options', () => {
  it('sends the configured method and custom headers, and a request body', async () => {
    seen.length = 0
    await httpCheck(new URL(`${base}/echo`), {
      method: 'post',
      headers: { 'X-Probe': 'yes' },
      body: '{"ping":1}',
    })
    const last = seen.at(-1)!
    expect(last.method).toBe('POST')
    expect(last.headers['x-probe']).toBe('yes')
    expect(last.body).toBe('{"ping":1}')
    expect(last.headers['content-length']).toBe('10')
  })

  it('applies basic auth from authUser/authPass', async () => {
    const ok = await httpCheck(new URL(`${base}/auth`), { authUser: 'u', authPass: 'p' })
    expect(ok.httpStatus).toBe(200)
    expect(ok.bodyText).toContain('welcome')

    const bad = await httpCheck(new URL(`${base}/auth`), { authUser: 'u', authPass: 'wrong' })
    expect(bad.httpStatus).toBe(401)
  })

  it('honours a per-call timeout', async () => {
    const res = await httpCheck(new URL(`${base}/slow`), { timeoutMs: 1000 })
    expect(res.error).toBeNull()

    const timedOut = await httpCheck(new URL(`${base}/slow`), { timeoutMs: 50 })
    expect(timedOut.error).toBeTruthy()
    expect(timedOut.httpStatus).toBeNull()
  })

  it('follows redirects by default and stops when followRedirects is false', async () => {
    const followed = await httpCheck(new URL(`${base}/redirect`))
    expect(followed.httpStatus).toBe(200)
    expect(followed.bodyText).toContain('arrived')
    expect(followed.redirectChain).toHaveLength(1)

    const notFollowed = await httpCheck(new URL(`${base}/redirect`), { followRedirects: false })
    expect(notFollowed.httpStatus).toBe(302)
    expect(notFollowed.redirectChain).toHaveLength(0)
  })

  it('returns a decoded body slice for assertions and still extracts the title', async () => {
    const res = await httpCheck(new URL(`${base}/big`), { bodyScanBytes: 262_144 })
    expect(res.pageTitle).toBe('Shop')
    expect(res.bodyText).toContain('Add to cart')
  })

  it('caps the returned body slice at bodyScanBytes', async () => {
    const res = await httpCheck(new URL(`${base}/big`), { bodyScanBytes: 100 })
    expect(res.bodyText!.length).toBeLessThanOrEqual(100)
  })
})
