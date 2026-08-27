import { withLogWrite } from './logDb'

/** Recomputes the ip_profiles materialized table from the full access_log history.
 * facet_crawl_score = the largest number of distinct query-string URLs a single IP hit on
 * any one path_pattern — the signature of a facet/parameter crawler (one IP hammering
 * /bibliography with hundreds of different filter combinations, as seen in this dataset). */
export async function rebuildIpProfiles(): Promise<{ rows: number; durationMs: number }> {
  const started = Date.now()

  const rows = await withLogWrite(async (conn) => {
    await conn.run(`DELETE FROM ip_profiles`)

    const result = await conn.run(`
      WITH per_ip AS (
        SELECT
          server_id,
          client_ip,
          count(*) AS request_count,
          sum(CASE WHEN status BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS error_4xx_count,
          sum(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS error_5xx_count,
          count(DISTINCT path_pattern) AS distinct_paths,
          bool_or(is_bot) AS is_bot,
          arg_max(bot_name, ts) FILTER (WHERE bot_name IS NOT NULL) AS bot_name,
          arg_max(country, ts) FILTER (WHERE country IS NOT NULL) AS country
        FROM access_log
        GROUP BY server_id, client_ip
      ),
      per_minute AS (
        SELECT server_id, client_ip, date_trunc('minute', ts) AS minute_bucket, count(*) AS c
        FROM access_log
        GROUP BY server_id, client_ip, minute_bucket
      ),
      max_per_min AS (
        SELECT server_id, client_ip, max(c) AS max_req_per_min
        FROM per_minute
        GROUP BY server_id, client_ip
      ),
      facet AS (
        SELECT server_id, client_ip, path_pattern, count(DISTINCT url) AS distinct_urls
        FROM access_log
        WHERE has_query
        GROUP BY server_id, client_ip, path_pattern
      ),
      facet_max AS (
        SELECT server_id, client_ip, max(distinct_urls) AS facet_crawl_score
        FROM facet
        GROUP BY server_id, client_ip
      )
      INSERT INTO ip_profiles
      SELECT
        p.server_id,
        p.client_ip,
        current_timestamp AS computed_at,
        p.request_count,
        p.error_4xx_count,
        p.error_5xx_count,
        p.distinct_paths,
        coalesce(m.max_req_per_min, 0) AS max_req_per_min,
        p.is_bot,
        p.bot_name,
        p.country,
        coalesce(f.facet_crawl_score, 0) AS facet_crawl_score
      FROM per_ip p
      LEFT JOIN max_per_min m USING (server_id, client_ip)
      LEFT JOIN facet_max f USING (server_id, client_ip)
    `)

    return result.rowsChanged
  })

  return { rows: Number(rows), durationMs: Date.now() - started }
}
