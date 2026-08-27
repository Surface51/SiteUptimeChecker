import { describe, it, expect } from 'vitest'
import { PhpSlowParser } from '../../../../server/utils/logs/parsers/phpSlow'

describe('PhpSlowParser', () => {
  it('parses a block with a header, script, and frames', () => {
    const lines = [
      '[10-Aug-2026 14:33:56]  [pool www] pid 8',
      'script_filename = /code/web//index.php',
      '[0x00007d5140215140] fastcgi_finish_request() /code/vendor/symfony/http-foundation/Response.php:431',
      '[0x00007d51402150c0] send() /code/web/index.php:20'
    ]
    const parser = new PhpSlowParser()
    for (const line of lines) parser.feedLine(line)
    const [row] = parser.flush()

    expect(row!.pool).toBe('www')
    expect(row!.pid).toBe(8)
    expect(row!.script).toBe('/code/web//index.php')
    expect(row!.stack.split('\n')).toHaveLength(2)
    expect(row!.ts.toISOString()).toBe('2026-08-10T14:33:56.000Z')
  })

  it('flushes the previous block when a blank line separates two records', () => {
    const parser = new PhpSlowParser()
    parser.feedLine('[10-Aug-2026 14:33:56]  [pool www] pid 8')
    parser.feedLine('script_filename = /a.php')
    let rows = parser.feedLine('')
    expect(rows).toHaveLength(0) // blank line alone doesn't finalize
    rows = parser.feedLine('[10-Aug-2026 14:35:46]  [pool www] pid 15')
    expect(rows).toHaveLength(1) // the next header does
    expect(rows[0]!.pid).toBe(8)
  })

  it('fingerprints identical stacks the same way regardless of the memory address', () => {
    const line1 = '[0x00007d5140215140] fastcgi_finish_request() /code/vendor/Response.php:431'
    const line2 = '[0xdeadbeef00000000] fastcgi_finish_request() /code/vendor/Response.php:431'

    const p1 = new PhpSlowParser()
    p1.feedLine('[10-Aug-2026 14:33:56]  [pool www] pid 1')
    p1.feedLine(line1)
    const [r1] = p1.flush()

    const p2 = new PhpSlowParser()
    p2.feedLine('[10-Aug-2026 14:33:56]  [pool www] pid 2')
    p2.feedLine(line2)
    const [r2] = p2.flush()

    expect(r1!.fingerprint).toBe(r2!.fingerprint)
  })
})
