import { rangeParams, sanitizeLogRows, serverIdsClause, type LogScope } from '../apiHelpers'
import { queryLogs } from '../logDb'

export async function visitorCountries(scope: LogScope) {
  const rows = await queryLogs(
    `SELECT country, count(*) AS requests, approx_count_distinct(client_ip) AS unique_visitors
     FROM access_log
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
       AND country IS NOT NULL
     GROUP BY country
     ORDER BY requests DESC
     LIMIT 100`,
    rangeParams(scope),
  )
  return sanitizeLogRows(rows)
}

// Bots are excluded from browser/OS breakdowns: they'd otherwise dominate, and a crawler's
// declared user agent says nothing about what humans are browsing with.
export async function visitorBrowsers(scope: LogScope) {
  const rows = await queryLogs(
    `SELECT ua_browser AS browser, count(*) AS requests
     FROM access_log
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
       AND ua_browser IS NOT NULL AND NOT is_bot
     GROUP BY ua_browser
     ORDER BY requests DESC
     LIMIT 20`,
    rangeParams(scope),
  )
  return sanitizeLogRows(rows)
}

export async function visitorOperatingSystems(scope: LogScope) {
  const rows = await queryLogs(
    `SELECT ua_os AS os, count(*) AS requests
     FROM access_log
     WHERE server_id IN ${serverIdsClause(scope.serverIds)} AND ts BETWEEN $from AND $to
       AND ua_os IS NOT NULL AND NOT is_bot
     GROUP BY ua_os
     ORDER BY requests DESC
     LIMIT 20`,
    rangeParams(scope),
  )
  return sanitizeLogRows(rows)
}
