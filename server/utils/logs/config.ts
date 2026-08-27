import { join, resolve } from 'node:path'
import { getDataDir } from '../db'

/** Where log files are dropped for ingestion, laid out as
 * <log-ingress>/<site-slug>/<env>/<server-ip>/<logfile> — see logs/discovery.ts. The site
 * segment is matched against sites.log_slug (SQLite) to link a folder to a monitored site;
 * unmatched folders are still ingested and browsable standalone. */
export function getLogIngressDir(): string {
  const configured = process.env.UPTIME_LOG_INGRESS_DIR
  return configured ? resolve(configured) : join(process.cwd(), 'log-ingress')
}

/** The DuckDB file holding parsed log rows. Kept alongside the SQLite database so that
 * UPTIME_DATA_DIR relocates both together (which is what points tests at a temp dir). */
export function getLogDbPath(): string {
  return join(getDataDir(), 'logs.duckdb')
}

/** Watch the ingress directory and ingest on change, instead of only on the hourly schedule. */
export function isLogWatchEnabled(): boolean {
  return process.env.UPTIME_LOG_WATCH === '1'
}

/** Log rows older than this are pruned by the daily retention job. */
export function getLogRetentionDays(): number {
  const parsed = Number(process.env.UPTIME_LOG_RETENTION_DAYS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90
}

/** Where a country-only mirror of geoip-lite's data files lives (logs/enrich/geo.ts) —
 * avoids loading geoip-lite's ~105MB city database into the web server when only the
 * country code is ever used. */
export function resolveGeoipDataDir(): string {
  return join(getDataDir(), 'geoip')
}
