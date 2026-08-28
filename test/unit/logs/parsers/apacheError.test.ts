import { describe, it, expect } from 'vitest'
import { ApacheErrorParser } from '../../../../server/utils/logs/parsers/apacheError'

describe('ApacheErrorParser', () => {
  it('parses an Apache 2.4 line: module, level, message, UTC timestamp', () => {
    const parser = new ApacheErrorParser()
    parser.feedLine(
      '[Wed Aug 27 10:00:00.123456 2026] [proxy_fcgi:error] [pid 1234:tid 5678] [client 1.2.3.4:5678] AH01071: Got error \'Primary script unknown\'',
    )
    const rows = parser.flush()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.level).toBe('error')
    expect(rows[0]!.bucket.toISOString()).toBe('2026-08-27T10:00:00.000Z')
    expect(rows[0]!.fingerprint).toContain('[proxy_fcgi]')
    expect(rows[0]!.sampleMessage).toContain('Primary script unknown')
  })

  it('parses an Apache 2.2 line with a bare level and no module', () => {
    const parser = new ApacheErrorParser()
    parser.feedLine('[Wed Aug 27 10:00:00 2026] [error] [client 1.2.3.4] File does not exist: /var/www/favicon.ico')
    const rows = parser.flush()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.level).toBe('error')
    expect(rows[0]!.fingerprint).toBe('File does not exist: /var/www/favicon.ico')
  })

  it('aggregates repeats within a minute and rolls the bucket on timestamp change', () => {
    const parser = new ApacheErrorParser()
    const line = '[Wed Aug 27 10:00:00 2026] [php:error] [pid 1] PHP Fatal error: boom'
    expect(parser.feedLine(line)).toHaveLength(0)
    for (let i = 0; i < 41; i++) parser.feedLine(line)
    const rolled = parser.feedLine('[Wed Aug 27 10:01:00 2026] [php:error] [pid 1] PHP Fatal error: boom')
    expect(rolled).toHaveLength(1)
    expect(rolled[0]!.count).toBe(42)
    expect(rolled[0]!.level).toBe('error')
  })

  it('drops a trailing referer field before fingerprinting', () => {
    const parser = new ApacheErrorParser()
    parser.feedLine(
      '[Wed Aug 27 10:00:00 2026] [core:error] [client 1.2.3.4] AH00124: Request exceeded the limit of 10 internal redirects, referer: https://example.com/a',
    )
    const rows = parser.flush()
    expect(rows[0]!.fingerprint).not.toContain('referer')
    expect(rows[0]!.fingerprint).not.toContain('example.com')
  })

  it('reports pending state while a bucket is open', () => {
    const parser = new ApacheErrorParser()
    expect(parser.hasPendingState()).toBe(false)
    parser.feedLine('[Wed Aug 27 10:00:00 2026] [error] [client 1.2.3.4] x')
    expect(parser.hasPendingState()).toBe(true)
    parser.flush()
    expect(parser.hasPendingState()).toBe(false)
  })

  it('counts a non-matching line as a parse error', () => {
    const parser = new ApacheErrorParser()
    expect(parser.feedLine('garbage')).toEqual([])
    expect(parser.getErrorCount()).toBe(1)
  })
})
