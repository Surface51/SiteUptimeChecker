import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runIngest } from '../../../server/utils/logs/ingest/queue'
import { closeLogDb, queryLogs } from '../../../server/utils/logs/logDb'

// Opt-in smoke test against a real tree of production logs, which the synthetic fixtures in
// ingest.test.ts can't stand in for: the nginx access format this parses is strict and
// non-standard (double space after the timestamp, trailing X-Forwarded-For chain), so the
// thing worth checking is that real files parse rather than pile up parse_errors.
//
//   LOG_SAMPLE_DIR=./log-ingress npx vitest run test/integration/logs/sampleIngest.test.ts
const sampleDir = process.env.LOG_SAMPLE_DIR

describe.skipIf(!sampleDir)('ingesting a real log tree', () => {
  it('parses the sample logs with a low error rate', async () => {
    const status = await runIngest([sampleDir!])
    expect(status.filesTotal).toBeGreaterThan(0)

    const [totals] = (await queryLogs(
      `SELECT sum(lines_ingested) AS lines, sum(parse_errors) AS errors FROM ingest_files`,
    )) as { lines: number | null; errors: number | null }[]

    const lines = Number(totals?.lines ?? 0)
    const errors = Number(totals?.errors ?? 0)

    const report: string[] = [
      `${status.filesTotal} files, ${status.filesSkipped} skipped, ${lines.toLocaleString()} lines, ` +
        `${errors.toLocaleString()} parse errors, ${status.errors.length} file errors`,
      ...status.errors,
    ]

    const perTable = await queryLogs(`
      SELECT 'access_log' AS t, count(*) AS n FROM access_log
      UNION ALL SELECT 'nginx_error_agg', count(*) FROM nginx_error_agg
      UNION ALL SELECT 'php_error', count(*) FROM php_error
      UNION ALL SELECT 'fpm_events', count(*) FROM fpm_events
      UNION ALL SELECT 'php_slow', count(*) FROM php_slow
      UNION ALL SELECT 'mysql_slow', count(*) FROM mysql_slow
      UNION ALL SELECT 'db_events', count(*) FROM db_events
    `)
    report.push(perTable.map((r) => `${r.t}=${Number(r.n).toLocaleString()}`).join('  '))

    // Vitest swallows console output from a long-running test, so the summary goes to a file
    // when asked for — this is the only way to actually read what the sample tree produced.
    const reportPath = process.env.LOG_SAMPLE_REPORT
    if (reportPath) writeFileSync(reportPath, report.join('\n') + '\n')

    expect(lines).toBeGreaterThan(0)
    expect(errors / Math.max(lines, 1)).toBeLessThan(0.02)

    await closeLogDb()
  }, 15 * 60 * 1000)
})
