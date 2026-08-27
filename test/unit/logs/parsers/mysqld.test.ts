import { describe, it, expect } from 'vitest'
import { MysqldParser } from '../../../../server/utils/logs/parsers/mysqld'

describe('MysqldParser', () => {
  it('parses a warning line with a single-digit (space-padded) hour', () => {
    const parser = new MysqldParser()
    const [row] = parser.feedLine(
      "2025-09-02  2:22:54 99 [Warning] Aborted connection 99 to db: 'pantheon' user: 'x' host: '10.73.9.77' (Got an error reading communication packets)"
    )
    expect(row!.threadId).toBe(99)
    expect(row!.level).toBe('Warning')
    expect(row!.ts.toISOString()).toBe('2025-09-02T02:22:54.000Z')
  })

  it('silently skips startup banner lines without a timestamp', () => {
    const parser = new MysqldParser()
    const rows = parser.feedLine("Version: '10.4.34-MariaDB-1' socket: '/shared-run/mysql.sock' port: 11119 mariadb.org binary distribution")
    expect(rows).toHaveLength(0)
    expect(parser.getErrorCount()).toBe(0)
  })

  it('silently skips blank lines', () => {
    const parser = new MysqldParser()
    expect(parser.feedLine('')).toHaveLength(0)
  })
})
