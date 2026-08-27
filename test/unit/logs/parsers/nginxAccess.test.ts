import { describe, it, expect } from 'vitest'
import { NginxAccessParser } from '../../../../server/utils/logs/parsers/nginxAccess'

const SAMPLE_LINE =
  '10.1.5.18 - - [24/Aug/2026:03:37:29 +0000]  "GET /bibliography?page=7 HTTP/1.1" 200 17740 "https://charlesives.org" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0" 41.350 "103.188.93.104, 103.188.93.104, 10.1.5.18"'

describe('NginxAccessParser', () => {
  it('parses a well-formed line', () => {
    const parser = new NginxAccessParser()
    const rows = parser.feedLine(SAMPLE_LINE)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.method).toBe('GET')
    expect(row.path).toBe('/bibliography')
    expect(row.hasQuery).toBe(true)
    expect(row.status).toBe(200)
    expect(row.bytes).toBe(17740)
    expect(row.duration).toBeCloseTo(41.35)
    expect(row.referer).toBe('https://charlesives.org')
    expect(row.uaBrowser).toBe('Edge')
  })

  it('uses the first XFF hop as the real client IP, not the load balancer address', () => {
    const parser = new NginxAccessParser()
    const rows = parser.feedLine(SAMPLE_LINE)
    expect(rows[0]!.clientIp).toBe('103.188.93.104')
  })

  it('falls back to the remote_addr field when there is no XFF header', () => {
    const line = SAMPLE_LINE.replace('"103.188.93.104, 103.188.93.104, 10.1.5.18"', '"-"')
    const parser = new NginxAccessParser()
    const rows = parser.feedLine(line)
    expect(rows[0]!.clientIp).toBe('10.1.5.18')
  })

  it('parses the exact timestamp as a UTC instant', () => {
    const parser = new NginxAccessParser()
    const rows = parser.feedLine(SAMPLE_LINE)
    expect(rows[0]!.ts.toISOString()).toBe('2026-08-24T03:37:29.000Z')
  })

  it('treats "-" bytes and duration as absent/zero rather than crashing', () => {
    const line = SAMPLE_LINE.replace(' 200 17740 ', ' 304 - ').replace(' 41.350 ', ' - ')
    const parser = new NginxAccessParser()
    const rows = parser.feedLine(line)
    expect(rows[0]!.bytes).toBe(0)
    expect(rows[0]!.duration).toBeNull()
  })

  it('counts unparseable lines as errors instead of throwing', () => {
    const parser = new NginxAccessParser()
    const rows = parser.feedLine('not a valid access log line')
    expect(rows).toHaveLength(0)
    expect(parser.getErrorCount()).toBe(1)
  })

  it('normalizes numeric path segments into a low-cardinality pattern', () => {
    const line = SAMPLE_LINE.replace('/bibliography?page=7', '/node/12345/edit')
    const parser = new NginxAccessParser()
    const rows = parser.feedLine(line)
    expect(rows[0]!.pathPattern).toBe('/node/{n}/edit')
  })

  it('classifies known bot user agents', () => {
    const line = SAMPLE_LINE.replace(
      /"Mozilla\/5\.0 \(Windows.*?Edg\/145\.0\.0\.0"/,
      '"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"'
    )
    const parser = new NginxAccessParser()
    const rows = parser.feedLine(line)
    expect(rows[0]!.isBot).toBe(true)
  })
})
