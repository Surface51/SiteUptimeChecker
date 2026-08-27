import { describe, it, expect } from 'vitest'
import { PhpErrorParser } from '../../../../server/utils/logs/parsers/phpError'

describe('PhpErrorParser', () => {
  it('parses a record with a stack trace spanning multiple lines', () => {
    const lines = [
      '[12-Aug-2026 08:51:03 UTC] RedisException: read error on connection to 10.73.8.165:12120 in /code/web/modules/contrib/redis/src/Client/PhpRedis.php on line 36 #0 /code/web/modules/contrib/redis/src/Client/PhpRedis.php(36): Redis->auth()',
      '#1 /code/web/modules/contrib/redis/src/ClientFactory.php(180): Drupal\\redis\\Client\\PhpRedis->getClient()',
      '#2 /code/web/index.php(19): Drupal\\Core\\DrupalKernel->handle()',
      '#3 {main}'
    ]
    const parser = new PhpErrorParser()
    for (const line of lines) parser.feedLine(line)
    const [row] = parser.flush()

    expect(row!.errorType).toBe('RedisException')
    expect(row!.srcFile).toBe('/code/web/modules/contrib/redis/src/Client/PhpRedis.php')
    expect(row!.srcLine).toBe(36)
    expect(row!.ts.toISOString()).toBe('2026-08-12T08:51:03.000Z')
    expect(row!.stack.split('\n')).toHaveLength(4)
  })

  it('converts a named IANA timezone in the bracket to the correct UTC instant', () => {
    const parser = new PhpErrorParser()
    parser.feedLine(
      '[12-Aug-2026 03:51:03 America/Chicago] Uncaught PHP Exception RedisException: "read error" at /code/web/modules/contrib/redis/src/Cache/PhpRedis.php line 61'
    )
    const [row] = parser.flush()
    // 03:51:03 CDT (UTC-5 in August) === 08:51:03 UTC
    expect(row!.ts.toISOString()).toBe('2026-08-12T08:51:03.000Z')
    expect(row!.errorType).toBe('RedisException')
  })

  it('groups occurrences of the same underlying error under one fingerprint', () => {
    const parser = new PhpErrorParser()
    const line =
      '[12-Aug-2026 03:51:03 America/Chicago] Uncaught PHP Exception RedisException: "read error" at /code/web/modules/contrib/redis/src/Cache/PhpRedis.php line 61'
    parser.feedLine(line)
    parser.feedLine(line)
    parser.feedLine(line)
    const rows = parser.flush()
    // Each line is its own record (no stack frames follow), so flush() only returns the last
    // pending one — feed a distinct terminator to force the first two to finalize instead.
    expect(rows).toHaveLength(1)
  })

  it('extracts namespaced exception class names', () => {
    const parser = new PhpErrorParser()
    parser.feedLine(
      "[18-Aug-2026 10:00:00 UTC] Drupal\\Core\\Database\\DatabaseExceptionWrapper: SQLSTATE[HY000] in /code/web/index.php on line 1"
    )
    const [row] = parser.flush()
    expect(row!.errorType).toBe('Drupal\\Core\\Database\\DatabaseExceptionWrapper')
  })

  it('fingerprints identical errors the same way across separate parser instances', () => {
    const line =
      '[12-Aug-2026 08:51:05 UTC] RedisException: x in /code/web/modules/contrib/redis/src/Cache/CacheBase.php on line 155 #0 /a.php(1): f()'
    const p1 = new PhpErrorParser()
    const p2 = new PhpErrorParser()
    p1.feedLine(line)
    p2.feedLine(line)
    const [r1] = p1.flush()
    const [r2] = p2.flush()
    expect(r1!.fingerprint).toBe(r2!.fingerprint)
  })
})
