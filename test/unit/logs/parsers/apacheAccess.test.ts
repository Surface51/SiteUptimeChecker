import { describe, it, expect } from 'vitest'
import { ApacheAccessParser } from '../../../../server/utils/logs/parsers/apacheAccess'

const COMBINED =
  '203.0.113.9 - - [24/Aug/2026:03:37:29 +0000] "GET /bibliography?page=7 HTTP/1.1" 200 17740 "https://charlesives.org" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0"'

describe('ApacheAccessParser', () => {
  it('parses a combined-format line', () => {
    const rows = new ApacheAccessParser().feedLine(COMBINED)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.clientIp).toBe('203.0.113.9')
    expect(row.method).toBe('GET')
    expect(row.path).toBe('/bibliography')
    expect(row.hasQuery).toBe(true)
    expect(row.status).toBe(200)
    expect(row.bytes).toBe(17740)
    expect(row.referer).toBe('https://charlesives.org')
    expect(row.uaBrowser).toBe('Edge')
    expect(row.ts.toISOString()).toBe('2026-08-24T03:37:29.000Z')
  })

  it('takes %h as the client IP directly (no XFF field in Apache logs)', () => {
    const rows = new ApacheAccessParser().feedLine(COMBINED)
    expect(rows[0]!.clientIp).toBe('203.0.113.9')
  })

  it('parses the common format (no referer / user-agent)', () => {
    const rows = new ApacheAccessParser().feedLine(
      '198.51.100.4 - - [24/Aug/2026:03:37:29 +0000] "GET / HTTP/1.1" 200 512',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.referer).toBe('')
    expect(rows[0]!.userAgent).toBe('')
    expect(rows[0]!.bytes).toBe(512)
  })

  it('strips a leading vhost token (vhost_combined)', () => {
    const rows = new ApacheAccessParser().feedLine(
      'charlesives.org:443 198.51.100.4 - - [24/Aug/2026:03:37:29 +0000] "GET /x HTTP/1.1" 200 10 "-" "curl/8.4"',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.clientIp).toBe('198.51.100.4')
    expect(rows[0]!.path).toBe('/x')
  })

  it('reads a trailing integer as %D microseconds and a decimal as %T seconds', () => {
    const us = new ApacheAccessParser().feedLine(
      '198.51.100.4 - - [24/Aug/2026:03:37:29 +0000] "GET / HTTP/1.1" 200 10 "-" "curl/8" 1500000',
    )
    expect(us[0]!.duration).toBeCloseTo(1.5)
    const sec = new ApacheAccessParser().feedLine(
      '198.51.100.4 - - [24/Aug/2026:03:37:29 +0000] "GET / HTTP/1.1" 200 10 "-" "curl/8" 0.421',
    )
    expect(sec[0]!.duration).toBeCloseTo(0.421)
  })

  it('keeps a row for a malformed request line but marks method/path as "-"', () => {
    const parser = new ApacheAccessParser()
    const rows = parser.feedLine(
      '45.128.0.1 - - [24/Aug/2026:03:37:29 +0000] "\\x16\\x03\\x01\\x00\\xf4\\x01" 400 0 "-" "-"',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.method).toBe('-')
    expect(rows[0]!.path).toBe('-')
    expect(rows[0]!.status).toBe(400)
    expect(parser.getErrorCount()).toBe(0)
  })

  it('dash byte count becomes 0', () => {
    const rows = new ApacheAccessParser().feedLine(
      '198.51.100.4 - - [24/Aug/2026:03:37:29 +0000] "GET / HTTP/1.1" 304 -',
    )
    expect(rows[0]!.bytes).toBe(0)
  })

  it('counts an unparseable line as a parse error, emits nothing', () => {
    const parser = new ApacheAccessParser()
    expect(parser.feedLine('not an apache line at all')).toEqual([])
    expect(parser.getErrorCount()).toBe(1)
  })
})
