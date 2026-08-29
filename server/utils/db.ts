import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { SiteSettings } from './siteSettings'
import { downSecondsForDay, downSecondsInRange } from './rollup'
import type {
  CheckRow,
  CheckStatus,
  CompareIncidentStats,
  ComparePhaseAverages,
  CompareRow,
  DailyUptime,
  DnsRecords,
  DnsRecordSet,
  IncidentRow,
  LighthouseFormFactor,
  LighthouseReport,
  MaintenanceWindowRow,
  NotificationRow,
  NotificationType,
  RedirectHop,
  SecurityHeadersReport,
  Site,
  SlaReport,
  SiteSummary,
  StatusTick,
  WhoisRecord,
} from '#shared/types'

const DATA_DIR = process.env.UPTIME_DATA_DIR ?? join(process.cwd(), '.data')
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
      screenshot_updated_at TEXT,
      degraded_ms INTEGER NOT NULL DEFAULT 5000,
      expected_status INTEGER,
      log_slug TEXT,
      content_expect TEXT,
      content_forbid TEXT,
      content_regex TEXT,
      content_min_bytes INTEGER,
      http_method TEXT NOT NULL DEFAULT 'GET',
      request_headers TEXT,
      request_body TEXT,
      auth_user TEXT,
      auth_pass TEXT,
      timeout_ms INTEGER NOT NULL DEFAULT 15000,
      follow_redirects INTEGER NOT NULL DEFAULT 1,
      accepted_statuses TEXT,
      baseline_mode TEXT NOT NULL DEFAULT 'fixed',
      content_watch INTEGER NOT NULL DEFAULT 0,
      content_watch_sensitivity INTEGER NOT NULL DEFAULT 30,
      body_chunks TEXT,
      body_chunks_at TEXT,
      sla_target REAL
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
      response_headers TEXT,

      assertion_failed INTEGER,
      assertion_detail TEXT,
      body_hash TEXT,
      degraded_threshold_ms REAL
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

    CREATE TABLE IF NOT EXISTS whois_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      registrar TEXT,
      created_date TEXT,
      updated_date TEXT,
      expiry_date TEXT,
      name_servers TEXT,
      statuses TEXT,
      raw TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_whois_site_time ON whois_records(site_id, checked_at DESC);

    CREATE TABLE IF NOT EXISTS dns_record_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      a TEXT,
      aaaa TEXT,
      ns TEXT,
      mx TEXT,
      txt TEXT,
      cname TEXT,
      soa TEXT,
      caa TEXT,
      resolve_ms REAL,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_dns_records_site_time ON dns_record_sets(site_id, checked_at DESC);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE
    );

    CREATE TABLE IF NOT EXISTS site_tags (
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (site_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_site_tags_tag ON site_tags(tag_id);

    -- Cooldown bookkeeping for raised alerts (log-derived and check-derived alike). Without
    -- it, every ingest run or domain refresh would re-notify about the same ongoing problem.
    -- fingerprint distinguishes instances within a type (an IP address, an expiry tier, a body
    -- hash) and is '' for alerts that are simply per-site. Was log_alert_state before the
    -- domain/cert/content alerts started sharing it — see migrate().
    CREATE TABLE IF NOT EXISTS alert_state (
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL,
      fingerprint TEXT NOT NULL DEFAULT '',
      last_fired_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (site_id, alert_type, fingerprint)
    );

    -- Per log-ingress folder settings, keyed by folder name rather than a site id: a folder
    -- can sit in log-ingress/ with no monitored site and no DuckDB rows yet. Lives here in
    -- SQLite (not the DuckDB log store) so the status page and the CLI can both read it while
    -- the log store is detached during a bulk ingest. An absent row means the folder is active.
    CREATE TABLE IF NOT EXISTS log_folder_settings (
      slug TEXT PRIMARY KEY,
      paused INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- One row per site per UTC day, written by the daily rollup job (server/utils/rollup.ts).
    -- Raw checks rows are pruned after ~30 days; this is what lets the 90-day calendar, the
    -- adaptive response-time baseline and the SLA panel see further back than that.
    -- down_seconds is time-weighted (incident intervals clipped to the day), not check-count.
    CREATE TABLE IF NOT EXISTS daily_uptime (
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      total_checks INTEGER NOT NULL,
      up_checks INTEGER NOT NULL,
      degraded_checks INTEGER NOT NULL,
      down_checks INTEGER NOT NULL,
      avg_ms REAL,
      p50_ms REAL,
      p95_ms REAL,
      max_ms REAL,
      down_seconds INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (site_id, day)
    );
  `)

  migrate(db)

  return db
}

function columnSet(db: Database.Database, table: string): Set<string> {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return new Set(cols.map((c) => c.name))
}

function hasTable(db: Database.Database, table: string): boolean {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table)
}

/**
 * Additive, idempotent migrations for databases created before a column existed. Fresh installs
 * (and the test DB) already have every column from the CREATE TABLE statements above, so this is
 * three PRAGMA reads and no work in the common case. Never drops or rewrites.
 */
function migrate(db: Database.Database) {
  const siteCols = columnSet(db, 'sites')
  const checkCols = columnSet(db, 'checks')
  const notifCols = columnSet(db, 'notifications')
  const add = (present: Set<string>, table: string, column: string, ddl: string) => {
    if (!present.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }

  // Pre-existing migrations.
  add(siteCols, 'sites', 'degraded_ms', `degraded_ms INTEGER NOT NULL DEFAULT 5000`)
  add(siteCols, 'sites', 'expected_status', `expected_status INTEGER`)
  add(notifCols, 'notifications', 'dismissed', `dismissed INTEGER NOT NULL DEFAULT 0`)
  add(siteCols, 'sites', 'log_slug', `log_slug TEXT`)

  // The cooldown table outgrew its log-only name once domain/cert/content alerts began using it.
  if (hasTable(db, 'log_alert_state') && !hasTable(db, 'alert_state')) {
    db.exec(`ALTER TABLE log_alert_state RENAME TO alert_state`)
  }

  // Check-depth settings — all nullable / defaulted so existing sites are unchanged.
  add(siteCols, 'sites', 'content_expect', `content_expect TEXT`)
  add(siteCols, 'sites', 'content_forbid', `content_forbid TEXT`)
  add(siteCols, 'sites', 'content_regex', `content_regex TEXT`)
  add(siteCols, 'sites', 'content_min_bytes', `content_min_bytes INTEGER`)
  add(siteCols, 'sites', 'http_method', `http_method TEXT NOT NULL DEFAULT 'GET'`)
  add(siteCols, 'sites', 'request_headers', `request_headers TEXT`)
  add(siteCols, 'sites', 'request_body', `request_body TEXT`)
  add(siteCols, 'sites', 'auth_user', `auth_user TEXT`)
  add(siteCols, 'sites', 'auth_pass', `auth_pass TEXT`)
  add(siteCols, 'sites', 'timeout_ms', `timeout_ms INTEGER NOT NULL DEFAULT 15000`)
  add(siteCols, 'sites', 'follow_redirects', `follow_redirects INTEGER NOT NULL DEFAULT 1`)
  add(siteCols, 'sites', 'accepted_statuses', `accepted_statuses TEXT`)
  add(siteCols, 'sites', 'baseline_mode', `baseline_mode TEXT NOT NULL DEFAULT 'fixed'`)
  add(siteCols, 'sites', 'content_watch', `content_watch INTEGER NOT NULL DEFAULT 0`)
  add(siteCols, 'sites', 'content_watch_sensitivity', `content_watch_sensitivity INTEGER NOT NULL DEFAULT 30`)
  add(siteCols, 'sites', 'body_chunks', `body_chunks TEXT`)
  add(siteCols, 'sites', 'body_chunks_at', `body_chunks_at TEXT`)
  add(siteCols, 'sites', 'sla_target', `sla_target REAL`)

  add(checkCols, 'checks', 'assertion_failed', `assertion_failed INTEGER`)
  add(checkCols, 'checks', 'assertion_detail', `assertion_detail TEXT`)
  add(checkCols, 'checks', 'body_hash', `body_hash TEXT`)
  add(checkCols, 'checks', 'degraded_threshold_ms', `degraded_threshold_ms REAL`)
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
  log_slug: string | null
  content_expect: string | null
  content_forbid: string | null
  content_regex: string | null
  content_min_bytes: number | null
  http_method: string
  request_headers: string | null
  request_body: string | null
  auth_user: string | null
  auth_pass: string | null
  timeout_ms: number
  follow_redirects: number
  accepted_statuses: string | null
  baseline_mode: string
  content_watch: number
  content_watch_sensitivity: number
  body_chunks: string | null
  body_chunks_at: string | null
  sla_target: number | null
}

function parseHeaders(raw: string | null): Record<string, string> | null {
  if (!raw) return null
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj as Record<string, string>
  } catch {
    // fall through
  }
  return null
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
    tags: getTagsForSite(row.id),
    logSlug: row.log_slug,
    httpMethod: row.http_method || 'GET',
    requestHeaders: parseHeaders(row.request_headers),
    requestBody: row.request_body,
    authUser: row.auth_user,
    hasAuthPass: !!row.auth_pass,
    timeoutMs: row.timeout_ms ?? 15000,
    followRedirects: row.follow_redirects === null ? true : !!row.follow_redirects,
    acceptedStatuses: row.accepted_statuses,
    contentExpect: row.content_expect,
    contentForbid: row.content_forbid,
    contentRegex: row.content_regex,
    contentMinBytes: row.content_min_bytes,
    baselineMode: row.baseline_mode === 'adaptive' ? 'adaptive' : 'fixed',
    contentWatch: !!row.content_watch,
    contentWatchSensitivity: row.content_watch_sensitivity ?? 30,
    slaTarget: row.sla_target,
  }
}

/** Server-only extras never placed on the wire `Site` — currently just the basic-auth password. */
export interface SiteSecrets {
  authPass: string | null
  /** Stored content-watch reference: the per-chunk hash list, or null before the first check. */
  bodyChunks: string[] | null
}

export function getSiteSecrets(siteId: number): SiteSecrets {
  const row = getDb()
    .prepare('SELECT auth_pass, body_chunks FROM sites WHERE id = ?')
    .get(siteId) as { auth_pass: string | null; body_chunks: string | null } | undefined
  let bodyChunks: string[] | null = null
  if (row?.body_chunks) {
    try {
      const parsed = JSON.parse(row.body_chunks)
      if (Array.isArray(parsed)) bodyChunks = parsed as string[]
    } catch {
      // ignore malformed
    }
  }
  return { authPass: row?.auth_pass ?? null, bodyChunks }
}

/** Persists a fresh content-watch reference after an accepted change (or the first-ever check). */
export function setSiteBodyChunks(siteId: number, chunks: string[]) {
  getDb()
    .prepare(`UPDATE sites SET body_chunks = ?, body_chunks_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(chunks), siteId)
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
  assertion_failed: number | null
  assertion_detail: string | null
  body_hash: string | null
  degraded_threshold_ms: number | null
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
    assertionFailed: !!row.assertion_failed,
    assertionDetail: row.assertion_detail,
    bodyHash: row.body_hash,
    degradedThresholdMs: row.degraded_threshold_ms,
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

// camelCase settings key -> sites column. The single source of truth for which fields
// insertSite/updateSite persist; parseSiteSettings() in server/utils/siteSettings.ts validates
// the same set.
const SITE_SETTINGS_COLUMNS: Record<string, string> = {
  url: 'url',
  name: 'name',
  checkIntervalSeconds: 'check_interval_seconds',
  degradedMs: 'degraded_ms',
  expectedStatus: 'expected_status',
  logSlug: 'log_slug',
  httpMethod: 'http_method',
  requestHeaders: 'request_headers',
  requestBody: 'request_body',
  authUser: 'auth_user',
  authPass: 'auth_pass',
  timeoutMs: 'timeout_ms',
  followRedirects: 'follow_redirects',
  acceptedStatuses: 'accepted_statuses',
  contentExpect: 'content_expect',
  contentForbid: 'content_forbid',
  contentRegex: 'content_regex',
  contentMinBytes: 'content_min_bytes',
  baselineMode: 'baseline_mode',
  contentWatch: 'content_watch',
  contentWatchSensitivity: 'content_watch_sensitivity',
  slaTarget: 'sla_target',
}

function toSiteDbValue(key: string, value: unknown): unknown {
  if (key === 'requestHeaders') return value == null ? null : JSON.stringify(value)
  if (key === 'followRedirects' || key === 'contentWatch') return value ? 1 : 0
  return value as string | number | null
}

export function insertSite(
  input: { url: string; name: string | null; checkIntervalSeconds: number } & Partial<SiteSettings>,
): Site {
  const cols: string[] = []
  const placeholders: string[] = []
  const values: unknown[] = []
  for (const [key, col] of Object.entries(SITE_SETTINGS_COLUMNS)) {
    const v = (input as Record<string, unknown>)[key]
    if (v === undefined) continue
    cols.push(col)
    placeholders.push('?')
    values.push(toSiteDbValue(key, v))
  }
  const result = getDb()
    .prepare(`INSERT INTO sites (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`)
    .run(...(values as (string | number | null)[]))
  return getSite(result.lastInsertRowid as number)!
}

export function updateSite(id: number, patch: Partial<SiteSettings> & { enabled?: boolean }): Site | null {
  const current = getSite(id)
  if (!current) return null

  const sets: string[] = []
  const values: unknown[] = []
  for (const [key, col] of Object.entries(SITE_SETTINGS_COLUMNS)) {
    if (!(key in patch)) continue
    const v = (patch as Record<string, unknown>)[key]
    if (v === undefined) continue
    sets.push(`${col} = ?`)
    values.push(toSiteDbValue(key, v))
  }
  if (patch.enabled !== undefined) {
    sets.push('enabled = ?')
    values.push(patch.enabled ? 1 : 0)
  }
  if (sets.length) {
    values.push(id)
    getDb()
      .prepare(`UPDATE sites SET ${sets.join(', ')} WHERE id = ?`)
      .run(...(values as (string | number | null)[]))
  }
  return getSite(id)
}

export function touchSiteScreenshot(id: number) {
  getDb()
    .prepare(`UPDATE sites SET screenshot_updated_at = datetime('now') WHERE id = ?`)
    .run(id)
}

export function deleteSite(id: number) {
  const db = getDb()
  db.prepare('DELETE FROM sites WHERE id = ?').run(id)
  // The site_tags rows cascade away with the site; sweep any tags that were only used here.
  db.prepare('DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM site_tags WHERE tag_id = tags.id)').run()
}

// ---------- tags queries ----------

export function getTagsForSite(siteId: number): string[] {
  const rows = getDb()
    .prepare(
      `SELECT t.name AS name FROM tags t
       JOIN site_tags st ON st.tag_id = t.id
       WHERE st.site_id = ?
       ORDER BY t.name COLLATE NOCASE ASC`,
    )
    .all(siteId) as { name: string }[]
  return rows.map((r) => r.name)
}

export function listAllTagNames(): string[] {
  const rows = getDb()
    .prepare('SELECT name FROM tags ORDER BY name COLLATE NOCASE ASC')
    .all() as { name: string }[]
  return rows.map((r) => r.name)
}

/** Looks up a tag case-insensitively, reusing the stored casing if it already exists. */
function findOrCreateTag(db: Database.Database, name: string): number {
  const existing = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').get(name) as
    | { id: number }
    | undefined
  if (existing) return existing.id
  return db.prepare('INSERT INTO tags (name) VALUES (?)').run(name).lastInsertRowid as number
}

export function addSiteTag(siteId: number, name: string): string[] {
  const db = getDb()
  const tagId = findOrCreateTag(db, name)
  db.prepare('INSERT OR IGNORE INTO site_tags (site_id, tag_id) VALUES (?, ?)').run(siteId, tagId)
  return getTagsForSite(siteId)
}

export function removeSiteTag(siteId: number, name: string): string[] {
  const db = getDb()
  const tag = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE').get(name) as
    | { id: number }
    | undefined
  if (tag) {
    db.prepare('DELETE FROM site_tags WHERE site_id = ? AND tag_id = ?').run(siteId, tag.id)
    // Drop tags no longer referenced by any site so the global tag list stays tidy.
    db.prepare('DELETE FROM tags WHERE id = ? AND NOT EXISTS (SELECT 1 FROM site_tags WHERE tag_id = ?)').run(
      tag.id,
      tag.id,
    )
  }
  return getTagsForSite(siteId)
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
  assertionFailed?: boolean
  assertionDetail?: string | null
  bodyHash?: string | null
  degradedThresholdMs?: number | null
}

export function insertCheck(input: InsertCheckInput): CheckRow {
  const result = getDb()
    .prepare(
      `INSERT INTO checks (
        site_id, status, http_status, error,
        time_dns, time_tcp, time_tls, time_ttfb, time_total,
        ssl_valid, ssl_issuer, ssl_expires_at, ssl_days_remaining,
        page_title, content_length, content_type,
        redirect_chain, security_headers, dns_records, response_headers,
        assertion_failed, assertion_detail, body_hash, degraded_threshold_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.assertionFailed ? 1 : 0,
      input.assertionDetail ?? null,
      input.bodyHash ?? null,
      input.degradedThresholdMs ?? null,
    )

  // Raw-check retention is handled fleet-wide once a day by server/utils/rollup.ts pruneChecks(),
  // not on every insert — a per-insert range delete over the whole fleet was needless churn.

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
      `SELECT checked_at, status, http_status, time_total, time_ttfb, time_dns, time_tcp, time_tls FROM checks
       WHERE site_id = ? AND checked_at >= datetime('now', ?)
       ORDER BY checked_at ASC LIMIT ?`,
    )
    .all(siteId, `-${hours} hours`, limit) as {
    checked_at: string
    status: string
    http_status: number | null
    time_total: number | null
    time_ttfb: number | null
    time_dns: number | null
    time_tcp: number | null
    time_tls: number | null
  }[]

  return rows.map((r) => ({
    checkedAt: r.checked_at,
    status: r.status as CheckStatus,
    httpStatus: r.http_status,
    timeTotal: r.time_total,
    timeTtfb: r.time_ttfb,
    timeDns: r.time_dns,
    timeTcp: r.time_tcp,
    timeTls: r.time_tls,
  }))
}

export interface ResponseStats {
  avgMs: number | null
  p95Ms: number | null
  count: number
}

export function getResponseStats(siteId: number, hours: number): ResponseStats {
  const rows = getDb()
    .prepare(
      `SELECT time_total FROM checks
       WHERE site_id = ? AND checked_at >= datetime('now', ?) AND time_total IS NOT NULL
       ORDER BY time_total ASC`,
    )
    .all(siteId, `-${hours} hours`) as { time_total: number }[]
  if (!rows.length) return { avgMs: null, p95Ms: null, count: 0 }

  const values = rows.map((r) => r.time_total)
  const avgMs = values.reduce((a, b) => a + b, 0) / values.length
  const idx = Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)
  return { avgMs, p95Ms: values[idx] ?? null, count: values.length }
}

export function getPhaseAverages(siteId: number, hours: number): ComparePhaseAverages {
  const row = getDb()
    .prepare(
      `SELECT AVG(time_dns) AS dns, AVG(time_tcp) AS tcp, AVG(time_tls) AS tls, AVG(time_ttfb) AS ttfb
       FROM checks WHERE site_id = ? AND checked_at >= datetime('now', ?)`,
    )
    .get(siteId, `-${hours} hours`) as {
    dns: number | null
    tcp: number | null
    tls: number | null
    ttfb: number | null
  }
  return { dns: row.dns, tcp: row.tcp, tls: row.tls, ttfb: row.ttfb }
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

interface DailyUptimeAgg {
  day: string
  total: number
  up: number
  down_seconds: number
  p95_ms: number | null
}

/**
 * Per-day uptime for the calendar and the SLA panel. History past ~30 days comes from the
 * `daily_uptime` rollup table (raw checks are pruned by then); the current day is always computed
 * live from `checks` so it stays fresh between the midnight rollup ticks.
 */
export function getDailyUptime(siteId: number, days = 30): DailyUptime[] {
  const today = new Date().toISOString().slice(0, 10)

  // Rollups are authoritative for any day they cover — they survive the raw-check prune and
  // carry downSeconds / p95. Raw checks fill in days a rollup hasn't been written for yet
  // (notably today, and the gap between a check landing and the next midnight tick).
  const rollups = getDb()
    .prepare(
      `SELECT day,
              total_checks AS total,
              (up_checks + degraded_checks) AS up,
              down_seconds,
              p95_ms
       FROM daily_uptime
       WHERE site_id = ? AND day >= date('now', ?)`,
    )
    .all(siteId, `-${days} days`) as DailyUptimeAgg[]

  const live = getDb()
    .prepare(
      `SELECT date(checked_at) AS day,
              COUNT(*) AS total,
              SUM(CASE WHEN status != 'down' THEN 1 ELSE 0 END) AS up
       FROM checks
       WHERE site_id = ? AND checked_at >= date('now', ?)
       GROUP BY day`,
    )
    .all(siteId, `-${days} days`) as { day: string; total: number; up: number }[]

  const rollupDays = new Set(rollups.map((r) => r.day))
  const byDay = new Map<string, DailyUptimeAgg>()
  for (const r of live) {
    if (rollupDays.has(r.day)) continue // rollup wins
    byDay.set(r.day, {
      day: r.day,
      total: r.total,
      up: r.up,
      down_seconds: r.total > 0 ? downSecondsForDay(siteId, r.day) : 0,
      p95_ms: null,
    })
  }
  for (const r of rollups) byDay.set(r.day, r)

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
      downSeconds: row?.down_seconds ?? 0,
      p95Ms: row?.p95_ms ?? null,
    })
  }
  return result
}

/** Trailing median of the last `n` daily p95s — the adaptive response-time baseline (3.3). */
export function getResponseBaselineMs(siteId: number, n = 7): number | null {
  const rows = getDb()
    .prepare(
      `SELECT p95_ms FROM daily_uptime
       WHERE site_id = ? AND p95_ms IS NOT NULL
       ORDER BY day DESC LIMIT ?`,
    )
    .all(siteId, n) as { p95_ms: number }[]
  if (rows.length < 3) return null
  const sorted = rows.map((r) => r.p95_ms).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

// ---------- SLA / error budget ----------

function monthBoundsMs(month: string): { start: number; end: number } {
  const [y, m] = month.split('-').map(Number)
  const start = Date.UTC(y!, m! - 1, 1)
  const end = Date.UTC(m! === 12 ? y! + 1 : y!, m! === 12 ? 0 : m!, 1)
  return { start, end }
}

/** MTTR / MTBF over the incidents that started within [fromMs, toMs). */
export function getIncidentMetrics(
  siteId: number,
  fromMs: number,
  toMs: number,
): { count: number; mttrSeconds: number | null; mtbfSeconds: number | null } {
  const rows = getDb()
    .prepare(
      `SELECT started_at, ended_at FROM incidents
       WHERE site_id = ? AND started_at >= ? AND started_at < ?
       ORDER BY started_at ASC`,
    )
    .all(
      siteId,
      new Date(fromMs).toISOString().slice(0, 19).replace('T', ' '),
      new Date(toMs).toISOString().slice(0, 19).replace('T', ' '),
    ) as { started_at: string; ended_at: string | null }[]

  const toMsOf = (s: string) => new Date(`${s.replace(' ', 'T')}Z`).getTime()
  const closed = rows.filter((r) => r.ended_at)
  const mttrSeconds = closed.length
    ? closed.reduce((sum, r) => sum + (toMsOf(r.ended_at!) - toMsOf(r.started_at)), 0) / closed.length / 1000
    : null

  let mtbfSeconds: number | null = null
  if (rows.length >= 2) {
    const first = toMsOf(rows[0]!.started_at)
    const last = toMsOf(rows[rows.length - 1]!.started_at)
    mtbfSeconds = (last - first) / (rows.length - 1) / 1000
  }

  return { count: rows.length, mttrSeconds, mtbfSeconds }
}

/**
 * Monthly SLA / error-budget figures for one site. Downtime is time-weighted from incident
 * intervals (not rollups), so it is correct even for a month whose rollups haven't run. For the
 * current month "elapsed" runs to now, so the budget reads sensibly mid-month.
 */
export function getSlaReport(siteId: number, month?: string): SlaReport | null {
  const site = getSite(siteId)
  if (!site || site.slaTarget === null) return null

  const now = new Date()
  const targetMonth = month ?? now.toISOString().slice(0, 7)
  const { start, end } = monthBoundsMs(targetMonth)
  const elapsedEnd = Math.min(now.getTime(), end)
  if (elapsedEnd <= start) {
    // A future month — nothing has elapsed.
    return {
      month: targetMonth,
      target: site.slaTarget,
      achievedPct: 100,
      downSeconds: 0,
      allowedDownSeconds: 0,
      budgetUsedPct: 0,
      elapsedSeconds: 0,
      incidentCount: 0,
      mttrSeconds: null,
      mtbfSeconds: null,
      trailing12: buildTrailing12(siteId, targetMonth),
    }
  }

  const elapsedSeconds = (elapsedEnd - start) / 1000
  const downSeconds = downSecondsInRange(siteId, start, elapsedEnd)
  const allowedDownSeconds = elapsedSeconds * (1 - site.slaTarget / 100)
  const achievedPct = 100 * (1 - downSeconds / elapsedSeconds)
  const budgetUsedPct = allowedDownSeconds > 0 ? (100 * downSeconds) / allowedDownSeconds : downSeconds > 0 ? Infinity : 0
  const metrics = getIncidentMetrics(siteId, start, elapsedEnd)

  return {
    month: targetMonth,
    target: site.slaTarget,
    achievedPct,
    downSeconds,
    allowedDownSeconds,
    budgetUsedPct: Number.isFinite(budgetUsedPct) ? budgetUsedPct : 100,
    elapsedSeconds,
    incidentCount: metrics.count,
    mttrSeconds: metrics.mttrSeconds,
    mtbfSeconds: metrics.mtbfSeconds,
    trailing12: buildTrailing12(siteId, targetMonth),
  }
}

function buildTrailing12(siteId: number, endMonth: string): { month: string; uptimePct: number | null }[] {
  const [ey, em] = endMonth.split('-').map(Number)
  const out: { month: string; uptimePct: number | null }[] = []
  const now = Date.now()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(ey!, em! - 1 - i, 1))
    const month = d.toISOString().slice(0, 7)
    const { start, end } = monthBoundsMs(month)
    const elapsedEnd = Math.min(now, end)
    if (elapsedEnd <= start) {
      out.push({ month, uptimePct: null })
      continue
    }
    const elapsed = (elapsedEnd - start) / 1000
    const down = downSecondsInRange(siteId, start, elapsedEnd)
    out.push({ month, uptimePct: 100 * (1 - down / elapsed) })
  }
  return out
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

/** Skips any id that doesn't resolve to an existing site. */
export function buildComparison(siteIds: number[], hours: number): CompareRow[] {
  return siteIds
    .map((id) => getSite(id))
    .filter((s): s is Site => s !== null)
    .map((site) => {
      const responseStats = getResponseStats(site.id, hours)
      const lighthouse = getLatestLighthouseReport(site.id, 'mobile')
      const sla = getSlaReport(site.id)
      return {
        site: { id: site.id, name: site.name, url: site.url },
        uptime24h: getUptime(site.id, 24),
        uptime7d: getUptime(site.id, 24 * 7),
        uptime30d: getUptime(site.id, 24 * 30),
        slaAchievedPct: sla?.achievedPct ?? null,
        slaTarget: sla?.target ?? null,
        avgMs: responseStats.avgMs,
        p95Ms: responseStats.p95Ms,
        phases: getPhaseAverages(site.id, hours),
        incidents: getIncidentStats(site.id, hours),
        sslDaysRemaining: getLatestCheck(site.id)?.sslDaysRemaining ?? null,
        lighthouse: {
          performance: lighthouse?.performance ?? null,
          accessibility: lighthouse?.accessibility ?? null,
          bestPractices: lighthouse?.bestPractices ?? null,
          seo: lighthouse?.seo ?? null,
        },
        series: getHistory(site.id, hours, 2000),
      }
    })
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

export function getIncidentStats(siteId: number, hours: number): CompareIncidentStats {
  const rows = getDb()
    .prepare(`SELECT * FROM incidents WHERE site_id = ? AND started_at >= datetime('now', ?)`)
    .all(siteId, `-${hours} hours`) as IncidentDbRow[]
  const totalDownSeconds = rows.reduce((sum, r) => sum + mapIncident(r).durationSeconds!, 0)
  return { count: rows.length, totalDownSeconds }
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

// ---------- whois records ----------

interface WhoisDbRow {
  id: number
  site_id: number
  checked_at: string
  registrar: string | null
  created_date: string | null
  updated_date: string | null
  expiry_date: string | null
  name_servers: string | null
  statuses: string | null
  raw: string | null
  error: string | null
}

function mapWhoisRecord(row: WhoisDbRow): WhoisRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    checkedAt: row.checked_at,
    registrar: row.registrar,
    createdDate: row.created_date,
    updatedDate: row.updated_date,
    expiryDate: row.expiry_date,
    nameServers: row.name_servers ? (JSON.parse(row.name_servers) as string[]) : [],
    statuses: row.statuses ? (JSON.parse(row.statuses) as string[]) : [],
    raw: row.raw,
    error: row.error,
  }
}

export interface InsertWhoisRecordInput {
  siteId: number
  registrar: string | null
  createdDate: string | null
  updatedDate: string | null
  expiryDate: string | null
  nameServers: string[]
  statuses: string[]
  raw: string | null
  error: string | null
}

export function insertWhoisRecord(input: InsertWhoisRecordInput): WhoisRecord {
  const result = getDb()
    .prepare(
      `INSERT INTO whois_records (
        site_id, registrar, created_date, updated_date, expiry_date, name_servers, statuses, raw, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.siteId,
      input.registrar,
      input.createdDate,
      input.updatedDate,
      input.expiryDate,
      JSON.stringify(input.nameServers),
      JSON.stringify(input.statuses),
      input.raw,
      input.error,
    )

  getDb()
    .prepare(`DELETE FROM whois_records WHERE site_id = ? AND checked_at < datetime('now', '-730 days')`)
    .run(input.siteId)

  const row = getDb().prepare('SELECT * FROM whois_records WHERE id = ?').get(result.lastInsertRowid) as WhoisDbRow
  return mapWhoisRecord(row)
}

export function getLatestWhoisRecord(siteId: number): WhoisRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM whois_records WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1')
    .get(siteId) as WhoisDbRow | undefined
  return row ? mapWhoisRecord(row) : null
}

export function getWhoisHistory(siteId: number, days: number, limit: number): WhoisRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM whois_records
       WHERE site_id = ? AND checked_at >= datetime('now', ?)
       ORDER BY checked_at ASC LIMIT ?`,
    )
    .all(siteId, `-${days} days`, limit) as WhoisDbRow[]
  return rows.map(mapWhoisRecord)
}

// ---------- dns record sets ----------

interface DnsRecordSetDbRow {
  id: number
  site_id: number
  checked_at: string
  a: string | null
  aaaa: string | null
  ns: string | null
  mx: string | null
  txt: string | null
  cname: string | null
  soa: string | null
  caa: string | null
  resolve_ms: number | null
  error: string | null
}

function parseStringArray(value: string | null): string[] {
  return value ? (JSON.parse(value) as string[]) : []
}

function mapDnsRecordSet(row: DnsRecordSetDbRow): DnsRecordSet {
  return {
    id: row.id,
    siteId: row.site_id,
    checkedAt: row.checked_at,
    a: parseStringArray(row.a),
    aaaa: parseStringArray(row.aaaa),
    ns: parseStringArray(row.ns),
    mx: parseStringArray(row.mx),
    txt: parseStringArray(row.txt),
    cname: parseStringArray(row.cname),
    soa: parseStringArray(row.soa),
    caa: parseStringArray(row.caa),
    resolveMs: row.resolve_ms,
    error: row.error,
  }
}

export interface InsertDnsRecordSetInput {
  siteId: number
  a: string[]
  aaaa: string[]
  ns: string[]
  mx: string[]
  txt: string[]
  cname: string[]
  soa: string[]
  caa: string[]
  resolveMs: number | null
  error: string | null
}

export function insertDnsRecordSet(input: InsertDnsRecordSetInput): DnsRecordSet {
  const result = getDb()
    .prepare(
      `INSERT INTO dns_record_sets (
        site_id, a, aaaa, ns, mx, txt, cname, soa, caa, resolve_ms, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.siteId,
      JSON.stringify(input.a),
      JSON.stringify(input.aaaa),
      JSON.stringify(input.ns),
      JSON.stringify(input.mx),
      JSON.stringify(input.txt),
      JSON.stringify(input.cname),
      JSON.stringify(input.soa),
      JSON.stringify(input.caa),
      input.resolveMs,
      input.error,
    )

  getDb()
    .prepare(`DELETE FROM dns_record_sets WHERE site_id = ? AND checked_at < datetime('now', '-730 days')`)
    .run(input.siteId)

  const row = getDb()
    .prepare('SELECT * FROM dns_record_sets WHERE id = ?')
    .get(result.lastInsertRowid) as DnsRecordSetDbRow
  return mapDnsRecordSet(row)
}

export function getLatestDnsRecordSet(siteId: number): DnsRecordSet | null {
  const row = getDb()
    .prepare('SELECT * FROM dns_record_sets WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1')
    .get(siteId) as DnsRecordSetDbRow | undefined
  return row ? mapDnsRecordSet(row) : null
}

/** The most recent `n` DNS snapshots, newest first — used to spot a nameserver change. */
export function getRecentDnsRecordSets(siteId: number, n: number): DnsRecordSet[] {
  const rows = getDb()
    .prepare('SELECT * FROM dns_record_sets WHERE site_id = ? ORDER BY checked_at DESC, id DESC LIMIT ?')
    .all(siteId, n) as DnsRecordSetDbRow[]
  return rows.map(mapDnsRecordSet)
}

export function getDnsHistory(siteId: number, days: number, limit: number): DnsRecordSet[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM dns_record_sets
       WHERE site_id = ? AND checked_at >= datetime('now', ?)
       ORDER BY checked_at ASC LIMIT ?`,
    )
    .all(siteId, `-${days} days`, limit) as DnsRecordSetDbRow[]
  return rows.map(mapDnsRecordSet)
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

// ---------- log folder settings ----------

export interface LogFolderSetting {
  slug: string
  paused: boolean
  updatedAt: string
}

export function listLogFolderSettings(): LogFolderSetting[] {
  const rows = getDb()
    .prepare('SELECT slug, paused, updated_at FROM log_folder_settings')
    .all() as { slug: string; paused: number; updated_at: string }[]
  return rows.map((r) => ({ slug: r.slug, paused: !!r.paused, updatedAt: r.updated_at }))
}

/** A folder with no row is active. */
export function isLogFolderPaused(slug: string): boolean {
  const row = getDb()
    .prepare('SELECT paused FROM log_folder_settings WHERE slug = ?')
    .get(slug) as { paused: number } | undefined
  return !!row?.paused
}

/** The set of paused folder slugs — one query for callers that check many folders in a loop. */
export function pausedLogFolders(): Set<string> {
  const rows = getDb()
    .prepare('SELECT slug FROM log_folder_settings WHERE paused = 1')
    .all() as { slug: string }[]
  return new Set(rows.map((r) => r.slug))
}

export function setLogFolderPaused(slug: string, paused: boolean) {
  getDb()
    .prepare(
      `INSERT INTO log_folder_settings (slug, paused, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(slug) DO UPDATE SET paused = excluded.paused, updated_at = datetime('now')`,
    )
    .run(slug, paused ? 1 : 0)
}
