import { describe, it, expect } from 'vitest'
import { NginxErrorParser } from '../../../../server/utils/logs/parsers/nginxError'

describe('NginxErrorParser', () => {
  it('aggregates repeated identical alerts into a single row with a count', () => {
    const parser = new NginxErrorParser()
    const line = '2026/08/23 03:38:03 [alert] 12#12: 128 worker_connections are not enough'
    let rows = parser.feedLine(line)
    expect(rows).toHaveLength(0) // still accumulating, same minute bucket

    for (let i = 0; i < 999; i++) parser.feedLine(line)
    rows = parser.flush()

    expect(rows).toHaveLength(1)
    expect(rows[0]!.count).toBe(1000)
    expect(rows[0]!.fingerprint).toBe('# worker_connections are not enough')
  })

  it('parses the client/request/host tail fields, including a trailing referrer field', () => {
    const line =
      '2026/08/16 16:05:04 [error] 12#12: *3623295 access forbidden by rule, client: 10.1.7.13, server: , request: "GET /.git/config HTTP/1.1", host: "charlesives.org", referrer: "http://charlesives.org/.git/config"'
    const parser = new NginxErrorParser()
    parser.feedLine(line)
    const rows = parser.flush()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.fingerprint).toBe('access forbidden by rule')
    expect(rows[0]!.sampleRequest).toBe('GET /.git/config HTTP/1.1')
    expect(rows[0]!.sampleHost).toBe('charlesives.org')
  })

  it('flushes the previous minute bucket when the timestamp rolls over', () => {
    const parser = new NginxErrorParser()
    parser.feedLine('2026/08/23 03:38:03 [alert] 12#12: 128 worker_connections are not enough')
    const rows = parser.feedLine('2026/08/23 03:39:00 [alert] 12#12: 128 worker_connections are not enough')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.count).toBe(1)
    expect(rows[0]!.bucket.toISOString()).toBe('2026-08-23T03:38:00.000Z')
  })

  it('handles the upstream field appearing before host', () => {
    const line =
      '2026/08/17 12:00:00 [error] 10#10: *1 upstream timed out, client: 10.1.1.1, server: , request: "GET / HTTP/1.1", upstream: "fastcgi://unix:/tmp.sock", host: "example.com"'
    const parser = new NginxErrorParser()
    parser.feedLine(line)
    const rows = parser.flush()
    expect(rows[0]!.sampleHost).toBe('example.com')
  })
})
