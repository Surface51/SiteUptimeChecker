import { describe, it, expect } from 'vitest'
import { PhpFpmParser } from '../../../../server/utils/logs/parsers/phpFpm'

describe('PhpFpmParser', () => {
  it('parses a child exited event', () => {
    const parser = new PhpFpmParser()
    const [row] = parser.feedLine('[24-Aug-2026 09:37:47] NOTICE: [pool www] child 28290 exited with code 0 after 112.157498 seconds from start')
    expect(row!.eventType).toBe('child_exited')
    expect(row!.pid).toBe(28290)
    expect(row!.exitCode).toBe(0)
    expect(row!.lifetimeSec).toBeCloseTo(112.157498)
    expect(row!.pool).toBe('www')
  })

  it('parses a child started event', () => {
    const parser = new PhpFpmParser()
    const [row] = parser.feedLine('[24-Aug-2026 09:37:47] NOTICE: [pool www] child 28295 started')
    expect(row!.eventType).toBe('child_started')
    expect(row!.pid).toBe(28295)
  })

  it('parses a slow-execution warning including the request URL', () => {
    const line =
      '[24-Aug-2026 09:46:24] WARNING: [pool www] child 28321, script \'/code/web//index.php\' (request: "GET /index.php?page=50") executing too slow (5.393409 sec), logging'
    const parser = new PhpFpmParser()
    const [row] = parser.feedLine(line)
    expect(row!.eventType).toBe('slow_exec')
    expect(row!.pid).toBe(28321)
    expect(row!.slowSec).toBeCloseTo(5.393409)
    expect(row!.requestUrl).toBe('GET /index.php?page=50')
  })

  it('parses a max_children warning', () => {
    const line = '[24-Aug-2026 14:49:00] WARNING: [pool www] server reached pm.max_children setting (6), consider raising it'
    const parser = new PhpFpmParser()
    const [row] = parser.feedLine(line)
    expect(row!.eventType).toBe('max_children')
  })

  it('classifies an unrecognized pool message as other rather than dropping it', () => {
    const line = '[24-Aug-2026 14:49:00] NOTICE: [pool www] something unexpected happened'
    const parser = new PhpFpmParser()
    const [row] = parser.feedLine(line)
    expect(row!.eventType).toBe('other')
  })
})
