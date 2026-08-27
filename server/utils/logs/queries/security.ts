import { createError } from 'h3'
import {
  rangeParams,
  sanitizeLogRow,
  sanitizeLogRows,
  serverIdsClause,
  type LogScope,
} from '../apiHelpers'
import { queryLogs } from '../logDb'
import { suspiciousPathWhereClause } from '../security'

export async function securityThreats(scope: LogScope) {
  const clause = serverIdsClause(scope.serverIds)
  const params = rangeParams(scope)

  const [suspiciousPaths, offenderIps, forbiddenSummary] = await Promise.all([
    queryLogs(
      `SELECT path, count(*) AS hits, approx_count_distinct(client_ip) AS unique_ips, max(ts) AS last_seen
       FROM access_log
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to AND (${suspiciousPathWhereClause()})
       GROUP BY path
       ORDER BY hits DESC
       LIMIT 50`,
      params,
    ),
    // A high 404 count from one address is the signature of someone walking a wordlist.
    queryLogs(
      `SELECT client_ip, country,
              count(*) AS requests,
              sum(CASE WHEN status = 404 THEN 1 ELSE 0 END) AS not_found_count,
              sum(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS error_count,
              max(ts) AS last_seen
       FROM access_log
       WHERE server_id IN ${clause} AND ts BETWEEN $from AND $to
       GROUP BY client_ip, country
       HAVING sum(CASE WHEN status = 404 THEN 1 ELSE 0 END) >= 10
       ORDER BY not_found_count DESC
       LIMIT 50`,
      params,
    ),
    queryLogs(
      `SELECT fingerprint, sum(count) AS total_count, max(bucket) AS last_seen
       FROM nginx_error_agg
       WHERE server_id IN ${clause} AND bucket BETWEEN $from AND $to
         AND (fingerprint ILIKE '%forbidden%' OR fingerprint ILIKE '%denied%')
       GROUP BY fingerprint
       ORDER BY total_count DESC
       LIMIT 20`,
      params,
    ),
  ])

  return {
    suspiciousPaths: sanitizeLogRows(suspiciousPaths),
    offenderIps: sanitizeLogRows(offenderIps),
    forbiddenSummary: sanitizeLogRows(forbiddenSummary),
  }
}

export async function ipProfile(scope: LogScope, ip: string) {
  const clause = serverIdsClause(scope.serverIds)
  const params = { ...rangeParams(scope), ip }

  const [profileRows, recentRows, topPathsRows] = await Promise.all([
    queryLogs(
      `SELECT client_ip, request_count, error_4xx_count, error_5xx_count, distinct_paths,
              max_req_per_min, is_bot, bot_name, country, facet_crawl_score, computed_at
       FROM ip_profiles
       WHERE server_id IN ${clause} AND client_ip = $ip`,
      { ip },
    ),
    queryLogs(
      `SELECT ts, method, path, status, duration, user_agent, referer
       FROM access_log
       WHERE server_id IN ${clause} AND client_ip = $ip AND ts BETWEEN $from AND $to
       ORDER BY ts DESC
       LIMIT 100`,
      params,
    ),
    queryLogs(
      `SELECT path_pattern, count(*) AS hits, sum(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors
       FROM access_log
       WHERE server_id IN ${clause} AND client_ip = $ip AND ts BETWEEN $from AND $to
       GROUP BY path_pattern
       ORDER BY hits DESC
       LIMIT 20`,
      params,
    ),
  ])

  return {
    ip,
    profile: profileRows[0] ? sanitizeLogRow(profileRows[0]) : null,
    recentRequests: sanitizeLogRows(recentRows),
    topPaths: sanitizeLogRows(topPathsRows),
  }
}

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
const IPV6_RE = /^[0-9a-fA-F:]+$/

export function isValidIp(ip: string): boolean {
  return IPV4_RE.test(ip) || (ip.includes(':') && IPV6_RE.test(ip))
}

/** Turns a set of offending addresses into nginx config the operator can paste. Validated
 * strictly, since the output is meant to be copied into a server config. */
export function buildBlockRules(raw: string) {
  const ips = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && isValidIp(s))

  if (ips.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No valid IPs provided (query param: ips=1.2.3.4,5.6.7.8)',
    })
  }

  const nginxDeny = ips.map((ip) => `deny ${ip};`).join('\n')
  const nginxLocationBlock =
    `location ~* \\.(git|env)$ {\n` +
    `${ips.map((ip) => `    # deny ${ip};`).join('\n')}\n` +
    `    deny all;\n}`

  return { ips, nginxDeny, nginxLocationBlock }
}
