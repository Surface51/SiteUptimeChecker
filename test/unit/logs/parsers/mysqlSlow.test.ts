import { describe, it, expect } from 'vitest'
import { MysqlSlowParser } from '../../../../server/utils/logs/parsers/mysqlSlow'

const RECORD_1 = [
  '# Time: 260818 15:05:33',
  '# User@Host: 7067df660c3743ee8e98d4c79b3696aa[7067df660c3743ee8e98d4c79b3696aa] @  [10.73.15.235]',
  '# Thread_id: 22041  Schema: pantheon  QC_hit: No',
  '# Query_time: 1.061825  Lock_time: 0.001526  Rows_sent: 1  Rows_examined: 7751',
  '# Rows_affected: 0  Bytes_sent: 61',
  'SET timestamp=1787065533;',
  'SELECT COUNT(*) AS "expression"',
  'FROM "search_api_db_bibliography" "t"',
  'WHERE ("t"."word" IN (\'71\'));'
]

// A second record sharing the same "# Time:" bucket — real logs only print # Time: when it changes.
const RECORD_2 = [
  '# User@Host: 7067df660c3743ee8e98d4c79b3696aa[7067df660c3743ee8e98d4c79b3696aa] @  [10.73.9.33]',
  '# Thread_id: 22042  Schema: pantheon  QC_hit: No',
  '# Query_time: 0.5  Lock_time: 0.0  Rows_sent: 1  Rows_examined: 10',
  '# Rows_affected: 0  Bytes_sent: 20',
  'SET timestamp=1787065534;',
  'SELECT 1;'
]

describe('MysqlSlowParser', () => {
  it('parses a full record with all header fields', () => {
    const parser = new MysqlSlowParser()
    for (const line of RECORD_1) parser.feedLine(line)
    const [row] = parser.flush()

    expect(row!.dbUser).toBe('7067df660c3743ee8e98d4c79b3696aa')
    expect(row!.dbHost).toBe('10.73.15.235')
    expect(row!.threadId).toBe(22041)
    expect(row!.dbSchema).toBe('pantheon')
    expect(row!.qcHit).toBe(false)
    expect(row!.queryTime).toBeCloseTo(1.061825)
    expect(row!.rowsExamined).toBe(7751)
    expect(row!.rowsAffected).toBe(0)
    expect(row!.bytesSent).toBe(61)
    expect(row!.ts.toISOString()).toBe(new Date(1787065533 * 1000).toISOString())
    expect(row!.sqlText).toContain('SELECT COUNT(*)')
  })

  it('starts a new record on # User@Host: even without a preceding # Time: line', () => {
    const parser = new MysqlSlowParser()
    for (const line of RECORD_1) parser.feedLine(line)
    let rows: ReturnType<MysqlSlowParser['feedLine']> = []
    for (const line of RECORD_2) {
      const out = parser.feedLine(line)
      if (out.length) rows = out
    }
    expect(rows).toHaveLength(1) // RECORD_1 flushed when RECORD_2's User@Host line arrived
    expect(rows[0]!.threadId).toBe(22041)

    const [last] = parser.flush()
    expect(last!.threadId).toBe(22042)
  })

  it('normalizes the SQL text into a fingerprint that ignores the literal value', () => {
    const parser1 = new MysqlSlowParser()
    for (const line of RECORD_1) parser1.feedLine(line)
    const [row1] = parser1.flush()

    const variant = RECORD_1.map((l) => l.replace("'71'", "'999'"))
    const parser2 = new MysqlSlowParser()
    for (const line of variant) parser2.feedLine(line)
    const [row2] = parser2.flush()

    expect(row1!.fingerprintHash).toBe(row2!.fingerprintHash)
  })
})
