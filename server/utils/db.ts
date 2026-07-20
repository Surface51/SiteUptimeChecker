import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type {
  CheckRow,
  CheckStatus,
  DnsRecords,
  NotificationRow,
  NotificationType,
  RedirectHop,
  SecurityHeadersReport,
  Site,
  SiteSummary,
} from '#shared/types'

const DATA_DIR = join(process.cwd(), '.data')
const SCREENSHOTS_DIR = join(DATA_DIR, 'screenshots')
const DB_PATH = join(DATA_DIR, 'uptime.db')

let db: Database.Database | null = null

export function getDataDir() {
  return DATA_DIR
}

export function getScreenshotsDir() {
  return SCREENSHOTS_DIR
}

export function getDb(): Database.Database {
  if (db) return db

  mkdirSync(DATA_DIR, { recursive: true })
  mkdirSync(SCREENSHOTS_DIR, { recursive: true })

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      name TEXT,
      check_interval_seconds INTEGER NOT NULL DEFAULT 300,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      screenshot_updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL,
      http_status INTEGER,
      error TEXT,

      time_dns REAL,
      time_tcp REAL,
      time_tls REAL,
      time_ttfb REAL,
      time_total REAL,

      ssl_valid INTEGER,
      ssl_issuer TEXT,
      ssl_expires_at TEXT,
      ssl_days_remaining INTEGER,

      page_title TEXT,
      content_length INTEGER,
      content_type TEXT,

      redirect_chain TEXT,
      security_headers TEXT,
      dns_records TEXT,
      response_headers TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_checks_site_time ON checks(site_id, checked_at DESC);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      read INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
  `)

  return db
}

export function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}

// ---------- row <-> domain mapping ----------

interface SiteRow {
  id: number
  url: string
  name: string | null
  check_interval_seconds: number
  enabled: number
  created_at: string
  screenshot_updated_at: string | null
}

function mapSite(row: SiteRow): Site {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    checkIntervalSeconds: row.check_interval_seconds,
    enabled: !!row.enabled,
    createdAt: row.created_at,
    screenshotUpdatedAt: row.screenshot_updated_at,
  }
}

interface CheckDbRow {
  id: number
  site_id: number
  checked_at: string
  status: string
  http_status: number | null
  error: string | null
  time_dns: number | null
  time_tcp: number | null
  time_tls: number | null
  time_ttfb: number | null
  time_total: number | null
  ssl_valid: number | null
  ssl_issuer: string | null
  ssl_expires_at: string | null
  ssl_days_remaining: number | null
  page_title: string | null
  content_length: number | null
  content_type: string | null
  redirect_chain: string | null
  security_headers: string | null
  dns_records: string | null
  response_headers: string | null
}

function mapCheck(row: CheckDbRow): CheckRow {
  return {
    id: row.id,
    siteId: row.site_id,
    checkedAt: row.checked_at,
    status: row.status as CheckStatus,
    httpStatus: row.http_status,
    error: row.error,
    timeDns: row.time_dns,
    timeTcp: row.time_tcp,
    timeTls: row.time_tls,
    timeTtfb: row.time_ttfb,
    timeTotal: row.time_total,
    sslValid: row.ssl_valid === null ? null : !!row.ssl_valid,
    sslIssuer: row.ssl_issuer,
    sslExpiresAt: row.ssl_expires_at,
    sslDaysRemaining: row.ssl_days_remaining,
    pageTitle: row.page_title,
    contentLength: row.content_length,
    contentType: row.content_type,
    redirectChain: row.redirect_chain ? (JSON.parse(row.redirect_chain) as RedirectHop[]) : [],
    securityHeaders: row.security_headers
      ? (JSON.parse(row.security_headers) as SecurityHeadersReport)
      : null,
    dnsRecords: row.dns_records ? (JSON.parse(row.dns_records) as DnsRecords) : null,
    responseHeaders: row.response_headers
      ? (JSON.parse(row.response_headers) as Record<string, string>)
      : {},
  }
}

// ---------- sites queries ----------

export function listSites(): Site[] {
  const rows = getDb().prepare('SELECT * FROM sites ORDER BY created_at ASC').all() as SiteRow[]
  return rows.map(mapSite)
}

export function getSite(id: number): Site | null {
  const row = getDb().prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRow | undefined
  return row ? mapSite(row) : null
}

export function getSiteByUrl(url: string): Site | null {
  const row = getDb().prepare('SELECT * FROM sites WHERE url = ?').get(url) as SiteRow | undefined
  return row ? mapSite(row) : null
}

export function insertSite(input: { url: string; name: string | null; checkIntervalSeconds: number }): Site {
  const result = getDb()
    .prepare(
      'INSERT INTO sites (url, name, check_interval_seconds) VALUES (?, ?, ?)',
    )
    .run(input.url, input.name, input.checkIntervalSeconds)
  return getSite(result.lastInsertRowid as number)!
}

export function updateSite(
  id: number,
  patch: Partial<{ url: string; name: string | null; checkIntervalSeconds: number; enabled: boolean }>,
): Site | null {
  const current = getSite(id)
  if (!current) return null

  getDb()
    .prepare(
      `UPDATE sites SET url = ?, name = ?, check_interval_seconds = ?, enabled = ? WHERE id = ?`,
    )
    .run(
      patch.url ?? current.url,
      patch.name === undefined ? current.name : patch.name,
      patch.checkIntervalSeconds ?? current.checkIntervalSeconds,
      (patch.enabled ?? current.enabled) ? 1 : 0,
      id,
    )
  return getSite(id)
}

export function touchSiteScreenshot(id: number) {
  getDb()
    .prepare(`UPDATE sites SET screenshot_updated_at = datetime('now') WHERE id = ?`)
    .run(id)
}

export function deleteSite(id: number) {
  getDb().prepare('DELETE FROM sites WHERE id = ?').run(id)
}

// ---------- checks queries ----------

export interface InsertCheckInput {
  siteId: number
  status: CheckStatus
  httpStatus: number | null
  error: string | null
  timeDns: number | null
  timeTcp: number | null
  timeTls: number | null
  timeTtfb: number | null
  timeTotal: number | null
  sslValid: boolean | null
  sslIssuer: string | null
  sslExpiresAt: string | null
  sslDaysRemaining: number | null
  pageTitle: string | null
  contentLength: number | null
  contentType: string | null
  redirectChain: RedirectHop[]
  securityHeaders: SecurityHeadersReport | null
  dnsRecords: DnsRecords | null
  responseHeaders: Record<string, string>
}

export function insertCheck(input: InsertCheckInput): CheckRow {
  const result = getDb()
    .prepare(
      `INSERT INTO checks (
        site_id, status, http_status, error,
        time_dns, time_tcp, time_tls, time_ttfb, time_total,
        ssl_valid, ssl_issuer, ssl_expires_at, ssl_days_remaining,
        page_title, content_length, content_type,
        redirect_chain, security_headers, dns_records, response_headers
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.siteId,
      input.status,
      input.httpStatus,
      input.error,
      input.timeDns,
      input.timeTcp,
      input.timeTls,
      input.timeTtfb,
      input.timeTotal,
      input.sslValid === null ? null : input.sslValid ? 1 : 0,
      input.sslIssuer,
      input.sslExpiresAt,
      input.sslDaysRemaining,
      input.pageTitle,
      input.contentLength,
      input.contentType,
      JSON.stringify(input.redirectChain),
      input.securityHeaders ? JSON.stringify(input.securityHeaders) : null,
      input.dnsRecords ? JSON.stringify(input.dnsRecords) : null,
      JSON.stringify(input.responseHeaders),
    )

  getDb()
    .prepare(`DELETE FROM checks WHERE site_id = ? AND checked_at < datetime('now', '-30 days')`)
    .run(input.siteId)

  const row = getDb().prepare('SELECT * FROM checks WHERE id = ?').get(result.lastInsertRowid) as CheckDbRow
  return mapCheck(row)
}

export function getLatestCheck(siteId: number): CheckRow | null {
  const row = getDb()
    .prepare('SELECT * FROM checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1')
    .get(siteId) as CheckDbRow | undefined
  return row ? mapCheck(row) : null
}

export function getUptime(siteId: number, hours: number): number | null {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status != 'down' THEN 1 ELSE 0 END) AS up
       FROM checks WHERE site_id = ? AND checked_at >= datetime('now', ?)`,
    )
    .get(siteId, `-${hours} hours`) as { total: number; up: number }
  if (!row.total) return null
  return (100 * row.up) / row.total
}

export function getSparkline(siteId: number, limit = 30): number[] {
  const rows = getDb()
    .prepare(
      `SELECT time_total FROM checks WHERE site_id = ? AND time_total IS NOT NULL
       ORDER BY checked_at DESC LIMIT ?`,
    )
    .all(siteId, limit) as { time_total: number }[]
  return rows.map((r) => r.time_total).reverse()
}

export function getHistory(siteId: number, hours: number, limit: number) {
  const rows = getDb()
    .prepare(
      `SELECT checked_at, status, http_status, time_total, time_ttfb FROM checks
       WHERE site_id = ? AND checked_at >= datetime('now', ?)
       ORDER BY checked_at ASC LIMIT ?`,
    )
    .all(siteId, `-${hours} hours`, limit) as {
    checked_at: string
    status: string
    http_status: number | null
    time_total: number | null
    time_ttfb: number | null
  }[]

  return rows.map((r) => ({
    checkedAt: r.checked_at,
    status: r.status as CheckStatus,
    httpStatus: r.http_status,
    timeTotal: r.time_total,
    timeTtfb: r.time_ttfb,
  }))
}

export function buildSiteSummary(site: Site): SiteSummary {
  return {
    ...site,
    latestCheck: getLatestCheck(site.id),
    uptime24h: getUptime(site.id, 24),
    uptime7d: getUptime(site.id, 24 * 7),
    sparkline: getSparkline(site.id),
  }
}

// ---------- notifications ----------

interface NotificationDbRow {
  id: number
  site_id: number
  type: string
  message: string
  created_at: string
  read: number
  site_name: string | null
  site_url: string
}

function mapNotification(row: NotificationDbRow): NotificationRow {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name,
    siteUrl: row.site_url,
    type: row.type as NotificationType,
    message: row.message,
    createdAt: row.created_at,
    read: !!row.read,
  }
}

export function insertNotification(input: { siteId: number; type: NotificationType; message: string }) {
  getDb()
    .prepare('INSERT INTO notifications (site_id, type, message) VALUES (?, ?, ?)')
    .run(input.siteId, input.type, input.message)
}

export function listNotifications(limit = 50): NotificationRow[] {
  const rows = getDb()
    .prepare(
      `SELECT n.*, s.name AS site_name, s.url AS site_url
       FROM notifications n JOIN sites s ON s.id = n.site_id
       ORDER BY n.created_at DESC LIMIT ?`,
    )
    .all(limit) as NotificationDbRow[]
  return rows.map(mapNotification)
}

export function markNotificationRead(id: number) {
  getDb().prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id)
}

export function markAllNotificationsRead() {
  getDb().prepare('UPDATE notifications SET read = 1 WHERE read = 0').run()
}
