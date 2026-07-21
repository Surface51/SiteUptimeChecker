import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type {
  CheckRow,
  CheckStatus,
  DailyUptime,
  DnsRecords,
  IncidentRow,
  LighthouseFormFactor,
  LighthouseReport,
  MaintenanceWindowRow,
  NotificationRow,
  NotificationType,
  RedirectHop,
  SecurityHeadersReport,
  Site,
  SiteSummary,
  StatusTick,
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

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      cause TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_site ON incidents(site_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS maintenance_windows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      reason TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_maintenance_site ON maintenance_windows(site_id, ends_at DESC);

    CREATE TABLE IF NOT EXISTS lighthouse_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      measured_at TEXT NOT NULL DEFAULT (datetime('now')),
      form_factor TEXT NOT NULL,
      performance REAL,
      accessibility REAL,
      best_practices REAL,
      seo REAL,
      fcp REAL,
      lcp REAL,
      tbt REAL,
      cls REAL,
      speed_index REAL,
      tti REAL,
      lighthouse_version TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_lh_site_time ON lighthouse_reports(site_id, form_factor, measured_at DESC);
  `)

  migrate(db)

  return db
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

function migrate(db: Database.Database) {
  if (!hasColumn(db, 'sites', 'degraded_ms')) {
    db.exec(`ALTER TABLE sites ADD COLUMN degraded_ms INTEGER NOT NULL DEFAULT 5000`)
  }
  if (!hasColumn(db, 'sites', 'expected_status')) {
    db.exec(`ALTER TABLE sites ADD COLUMN expected_status INTEGER`)
  }
  if (!hasColumn(db, 'notifications', 'dismissed')) {
    db.exec(`ALTER TABLE notifications ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0`)
  }
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
  degraded_ms: number
  expected_status: number | null
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
    degradedMs: row.degraded_ms,
    expectedStatus: row.expected_status,
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

export function insertSite(input: {
  url: string
  name: string | null
  checkIntervalSeconds: number
  degradedMs?: number
  expectedStatus?: number | null
}): Site {
  const result = getDb()
    .prepare(
      'INSERT INTO sites (url, name, check_interval_seconds, degraded_ms, expected_status) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      input.url,
      input.name,
      input.checkIntervalSeconds,
      input.degradedMs ?? 5000,
      input.expectedStatus ?? null,
    )
  return getSite(result.lastInsertRowid as number)!
}

export function updateSite(
  id: number,
  patch: Partial<{
    url: string
    name: string | null
    checkIntervalSeconds: number
    enabled: boolean
    degradedMs: number
    expectedStatus: number | null
  }>,
): Site | null {
  const current = getSite(id)
  if (!current) return null

  getDb()
    .prepare(
      `UPDATE sites SET url = ?, name = ?, check_interval_seconds = ?, enabled = ?, degraded_ms = ?, expected_status = ? WHERE id = ?`,
    )
    .run(
      patch.url ?? current.url,
      patch.name === undefined ? current.name : patch.name,
      patch.checkIntervalSeconds ?? current.checkIntervalSeconds,
      (patch.enabled ?? current.enabled) ? 1 : 0,
      patch.degradedMs ?? current.degradedMs,
      patch.expectedStatus === undefined ? current.expectedStatus : patch.expectedStatus,
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

export function getStatusTicks(siteId: number, limit = 40): StatusTick[] {
  const rows = getDb()
    .prepare(
      `SELECT checked_at, status FROM checks WHERE site_id = ?
       ORDER BY checked_at DESC LIMIT ?`,
    )
    .all(siteId, limit) as { checked_at: string; status: string }[]
  return rows.reverse().map((r) => ({ checkedAt: r.checked_at, status: r.status as CheckStatus }))
}

export interface CheckLogFilter {
  limit: number
  offset: number
  status?: CheckStatus
}

export function getCheckLog(siteId: number, filter: CheckLogFilter): CheckRow[] {
  const rows = filter.status
    ? (getDb()
        .prepare(
          `SELECT * FROM checks WHERE site_id = ? AND status = ?
           ORDER BY checked_at DESC LIMIT ? OFFSET ?`,
        )
        .all(siteId, filter.status, filter.limit, filter.offset) as CheckDbRow[])
    : (getDb()
        .prepare(
          `SELECT * FROM checks WHERE site_id = ?
           ORDER BY checked_at DESC LIMIT ? OFFSET ?`,
        )
        .all(siteId, filter.limit, filter.offset) as CheckDbRow[])
  return rows.map(mapCheck)
}

export function getDailyUptime(siteId: number, days = 30): DailyUptime[] {
  const rows = getDb()
    .prepare(
      `SELECT date(checked_at) AS day,
              COUNT(*) AS total,
              SUM(CASE WHEN status != 'down' THEN 1 ELSE 0 END) AS up
       FROM checks
       WHERE site_id = ? AND checked_at >= date('now', ?)
       GROUP BY day
       ORDER BY day ASC`,
    )
    .all(siteId, `-${days} days`) as { day: string; total: number; up: number }[]

  const byDay = new Map(rows.map((r) => [r.day, r]))
  const result: DailyUptime[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    const key = d.toISOString().slice(0, 10)
    const row = byDay.get(key)
    result.push({
      date: key,
      total: row?.total ?? 0,
      uptime: row && row.total > 0 ? (100 * row.up) / row.total : null,
    })
  }
  return result
}

export function buildSiteSummary(site: Site): SiteSummary {
  return {
    ...site,
    latestCheck: getLatestCheck(site.id),
    uptime24h: getUptime(site.id, 24),
    uptime7d: getUptime(site.id, 24 * 7),
    sparkline: getSparkline(site.id),
    statusTicks: getStatusTicks(site.id),
    openIncident: getOpenIncident(site.id),
    inMaintenance: isInMaintenance(site.id),
    latestPerformance: getLatestLighthouseReport(site.id, 'mobile')?.performance ?? null,
    latestPerformanceDesktop: getLatestLighthouseReport(site.id, 'desktop')?.performance ?? null,
  }
}

// ---------- incidents ----------

interface IncidentDbRow {
  id: number
  site_id: number
  started_at: string
  ended_at: string | null
  cause: string | null
}

function mapIncident(row: IncidentDbRow): IncidentRow {
  let durationSeconds: number | null = null
  const start = new Date(`${row.started_at.replace(' ', 'T')}Z`).getTime()
  const end = row.ended_at ? new Date(`${row.ended_at.replace(' ', 'T')}Z`).getTime() : Date.now()
  durationSeconds = Math.max(0, Math.round((end - start) / 1000))

  return {
    id: row.id,
    siteId: row.site_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    cause: row.cause,
    durationSeconds,
  }
}

export function getOpenIncident(siteId: number): IncidentRow | null {
  const row = getDb()
    .prepare('SELECT * FROM incidents WHERE site_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1')
    .get(siteId) as IncidentDbRow | undefined
  return row ? mapIncident(row) : null
}

export function openIncident(siteId: number, cause: string | null) {
  if (getOpenIncident(siteId)) return
  getDb().prepare('INSERT INTO incidents (site_id, cause) VALUES (?, ?)').run(siteId, cause)
}

export function closeOpenIncident(siteId: number) {
  getDb()
    .prepare(`UPDATE incidents SET ended_at = datetime('now') WHERE site_id = ? AND ended_at IS NULL`)
    .run(siteId)
}

export function listIncidents(siteId: number, limit = 50): IncidentRow[] {
  const rows = getDb()
    .prepare('SELECT * FROM incidents WHERE site_id = ? ORDER BY started_at DESC LIMIT ?')
    .all(siteId, limit) as IncidentDbRow[]
  return rows.map(mapIncident)
}

// ---------- maintenance windows ----------

interface MaintenanceDbRow {
  id: number
  site_id: number
  starts_at: string
  ends_at: string
  reason: string | null
}

function mapMaintenance(row: MaintenanceDbRow): MaintenanceWindowRow {
  return {
    id: row.id,
    siteId: row.site_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason,
  }
}

export function listMaintenanceWindows(siteId: number): MaintenanceWindowRow[] {
  const rows = getDb()
    .prepare('SELECT * FROM maintenance_windows WHERE site_id = ? ORDER BY starts_at DESC')
    .all(siteId) as MaintenanceDbRow[]
  return rows.map(mapMaintenance)
}

export function insertMaintenanceWindow(input: {
  siteId: number
  startsAt: string
  endsAt: string
  reason: string | null
}): MaintenanceWindowRow {
  const result = getDb()
    .prepare('INSERT INTO maintenance_windows (site_id, starts_at, ends_at, reason) VALUES (?, ?, ?, ?)')
    .run(input.siteId, input.startsAt, input.endsAt, input.reason)
  const row = getDb()
    .prepare('SELECT * FROM maintenance_windows WHERE id = ?')
    .get(result.lastInsertRowid) as MaintenanceDbRow
  return mapMaintenance(row)
}

export function deleteMaintenanceWindow(id: number) {
  getDb().prepare('DELETE FROM maintenance_windows WHERE id = ?').run(id)
}

export function isInMaintenance(siteId: number, at?: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM maintenance_windows
       WHERE site_id = ? AND starts_at <= ? AND ends_at >= ?`,
    )
    .get(siteId, at ?? new Date().toISOString(), at ?? new Date().toISOString()) as { n: number }
  return row.n > 0
}

// ---------- lighthouse reports ----------

interface LighthouseDbRow {
  id: number
  site_id: number
  measured_at: string
  form_factor: string
  performance: number | null
  accessibility: number | null
  best_practices: number | null
  seo: number | null
  fcp: number | null
  lcp: number | null
  tbt: number | null
  cls: number | null
  speed_index: number | null
  tti: number | null
  lighthouse_version: string | null
  error: string | null
}

function mapLighthouseReport(row: LighthouseDbRow): LighthouseReport {
  return {
    id: row.id,
    siteId: row.site_id,
    measuredAt: row.measured_at,
    formFactor: row.form_factor as LighthouseFormFactor,
    performance: row.performance,
    accessibility: row.accessibility,
    bestPractices: row.best_practices,
    seo: row.seo,
    fcp: row.fcp,
    lcp: row.lcp,
    tbt: row.tbt,
    cls: row.cls,
    speedIndex: row.speed_index,
    tti: row.tti,
    lighthouseVersion: row.lighthouse_version,
    error: row.error,
  }
}

export interface InsertLighthouseReportInput {
  siteId: number
  formFactor: LighthouseFormFactor
  performance: number | null
  accessibility: number | null
  bestPractices: number | null
  seo: number | null
  fcp: number | null
  lcp: number | null
  tbt: number | null
  cls: number | null
  speedIndex: number | null
  tti: number | null
  lighthouseVersion: string | null
  error: string | null
}

export function insertLighthouseReport(input: InsertLighthouseReportInput): LighthouseReport {
  const result = getDb()
    .prepare(
      `INSERT INTO lighthouse_reports (
        site_id, form_factor, performance, accessibility, best_practices, seo,
        fcp, lcp, tbt, cls, speed_index, tti, lighthouse_version, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.siteId,
      input.formFactor,
      input.performance,
      input.accessibility,
      input.bestPractices,
      input.seo,
      input.fcp,
      input.lcp,
      input.tbt,
      input.cls,
      input.speedIndex,
      input.tti,
      input.lighthouseVersion,
      input.error,
    )

  getDb()
    .prepare(`DELETE FROM lighthouse_reports WHERE site_id = ? AND measured_at < datetime('now', '-180 days')`)
    .run(input.siteId)

  const row = getDb()
    .prepare('SELECT * FROM lighthouse_reports WHERE id = ?')
    .get(result.lastInsertRowid) as LighthouseDbRow
  return mapLighthouseReport(row)
}

export function getLatestLighthouseReport(siteId: number, formFactor: LighthouseFormFactor): LighthouseReport | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM lighthouse_reports
       WHERE site_id = ? AND form_factor = ? AND error IS NULL
       ORDER BY measured_at DESC LIMIT 1`,
    )
    .get(siteId, formFactor) as LighthouseDbRow | undefined
  return row ? mapLighthouseReport(row) : null
}

export function getLighthouseHistory(
  siteId: number,
  formFactor: LighthouseFormFactor,
  days: number,
  limit: number,
): LighthouseReport[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM lighthouse_reports
       WHERE site_id = ? AND form_factor = ? AND measured_at >= datetime('now', ?)
       ORDER BY measured_at ASC LIMIT ?`,
    )
    .all(siteId, formFactor, `-${days} days`, limit) as LighthouseDbRow[]
  return rows.map(mapLighthouseReport)
}

// ---------- notifications ----------

interface NotificationDbRow {
  id: number
  site_id: number
  type: string
  message: string
  created_at: string
  read: number
  dismissed: number
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
    dismissed: !!row.dismissed,
  }
}

export function insertNotification(input: { siteId: number; type: NotificationType; message: string }) {
  getDb()
    .prepare('INSERT INTO notifications (site_id, type, message) VALUES (?, ?, ?)')
    .run(input.siteId, input.type, input.message)
}

export interface NotificationFilter {
  limit: number
  offset?: number
  siteId?: number
  type?: NotificationType
  unreadOnly?: boolean
  /** Dismissed notifications are excluded by default (the bell only wants "active" ones). */
  includeDismissed?: boolean
}

function buildNotificationWhere(filter: Omit<NotificationFilter, 'limit' | 'offset'>): {
  clause: string
  params: (string | number)[]
} {
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (!filter.includeDismissed) {
    conditions.push('n.dismissed = 0')
  }
  if (filter.siteId !== undefined) {
    conditions.push('n.site_id = ?')
    params.push(filter.siteId)
  }
  if (filter.type) {
    conditions.push('n.type = ?')
    params.push(filter.type)
  }
  if (filter.unreadOnly) {
    conditions.push('n.read = 0')
  }

  return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params }
}

export function listNotifications(filter: NotificationFilter): NotificationRow[] {
  const { clause, params } = buildNotificationWhere(filter)
  const rows = getDb()
    .prepare(
      `SELECT n.*, s.name AS site_name, s.url AS site_url
       FROM notifications n JOIN sites s ON s.id = n.site_id
       ${clause}
       ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, filter.limit, filter.offset ?? 0) as NotificationDbRow[]
  return rows.map(mapNotification)
}

export function countNotifications(filter: Omit<NotificationFilter, 'limit' | 'offset'> = {}): number {
  const { clause, params } = buildNotificationWhere(filter)
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM notifications n ${clause}`)
    .get(...params) as { n: number }
  return row.n
}

export function markNotificationRead(id: number) {
  getDb().prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id)
}

export function markAllNotificationsRead() {
  getDb().prepare('UPDATE notifications SET read = 1 WHERE read = 0').run()
}

export function dismissAllNotifications(filter?: { siteId?: number }) {
  if (filter?.siteId !== undefined) {
    getDb()
      .prepare('UPDATE notifications SET dismissed = 1 WHERE dismissed = 0 AND site_id = ?')
      .run(filter.siteId)
  } else {
    getDb().prepare('UPDATE notifications SET dismissed = 1 WHERE dismissed = 0').run()
  }
}
