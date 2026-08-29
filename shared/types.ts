export type CheckStatus = 'up' | 'degraded' | 'down'

export interface RedirectHop {
  url: string
  status: number
}

export interface SecurityHeaderResult {
  present: boolean
  value: string | null
}

export interface SecurityHeadersReport {
  headers: Record<string, SecurityHeaderResult>
  score: number
  maxScore: number
}

export interface DnsRecords {
  a: string[]
  aaaa: string[]
  resolveMs: number | null
  error: string | null
}

export interface WhoisRecord {
  id: number
  siteId: number
  checkedAt: string
  registrar: string | null
  createdDate: string | null
  updatedDate: string | null
  expiryDate: string | null
  nameServers: string[]
  statuses: string[]
  raw: string | null
  error: string | null
}

/** Fuller weekly DNS snapshot (NS/MX/TXT/CNAME/SOA/CAA), distinct from the per-check `DnsRecords` above. */
export interface DnsRecordSet {
  id: number
  siteId: number
  checkedAt: string
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

export type BaselineMode = 'fixed' | 'adaptive'

export interface Site {
  id: number
  url: string
  name: string | null
  checkIntervalSeconds: number
  enabled: boolean
  createdAt: string
  screenshotUpdatedAt: string | null
  degradedMs: number
  expectedStatus: number | null
  tags: string[]
  /** Name of this site's folder under log-ingress/, or null if no logs are shipped for it. */
  logSlug: string | null

  // --- Advanced request options (3.2) ---
  httpMethod: string
  requestHeaders: Record<string, string> | null
  requestBody: string | null
  authUser: string | null
  /** True when a stored password exists. The password itself never leaves the server. */
  hasAuthPass: boolean
  timeoutMs: number
  followRedirects: boolean
  /** Accepted-status expression, e.g. "200", "200,204", "200-299", "2xx,3xx". Null = default heuristic. */
  acceptedStatuses: string | null

  // --- Content assertions (3.1) ---
  contentExpect: string | null
  contentForbid: string | null
  contentRegex: string | null
  contentMinBytes: number | null

  // --- Adaptive response-time baseline (3.3) ---
  baselineMode: BaselineMode

  // --- Content-change watch (3.4) ---
  contentWatch: boolean
  contentWatchSensitivity: number

  // --- SLA (5) — percent target, e.g. 99.9. Null hides the SLA panel. ---
  slaTarget: number | null
}

export interface CheckRow {
  id: number
  siteId: number
  checkedAt: string
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

  /** A configured content assertion failed on this check — forces status 'down'. */
  assertionFailed: boolean
  /** Human description of the failed assertion, e.g. 'missing expected text "Add to cart"'. */
  assertionDetail: string | null
  /** Hash of the normalised response body — lets the check log show that content differed. */
  bodyHash: string | null
  /** The degraded threshold (ms) actually applied — fixed value, or the adaptive one. */
  degradedThresholdMs: number | null
}

export interface StatusTick {
  checkedAt: string
  status: CheckStatus
}

export interface SiteSummary extends Site {
  latestCheck: CheckRow | null
  uptime24h: number | null
  uptime7d: number | null
  sparkline: number[]
  statusTicks: StatusTick[]
  openIncident: IncidentRow | null
  inMaintenance: boolean
  latestPerformance: number | null
  latestPerformanceDesktop: number | null
}

export interface HistoryPoint {
  checkedAt: string
  status: CheckStatus
  httpStatus: number | null
  timeTotal: number | null
  timeTtfb: number | null
  timeDns: number | null
  timeTcp: number | null
  timeTls: number | null
}

export interface IncidentRow {
  id: number
  siteId: number
  startedAt: string
  endedAt: string | null
  cause: string | null
  durationSeconds: number | null
}

export interface MaintenanceWindowRow {
  id: number
  siteId: number
  startsAt: string
  endsAt: string
  reason: string | null
}

export interface DailyUptime {
  date: string
  uptime: number | null
  total: number
  /** Time-weighted downtime for the day, seconds. From incident intervals clipped to the day. */
  downSeconds: number
  /** p95 response time for the day, ms — feeds the adaptive baseline and the SLA panel. */
  p95Ms: number | null
}

export interface ComparePhaseAverages {
  dns: number | null
  tcp: number | null
  tls: number | null
  ttfb: number | null
}

export interface CompareIncidentStats {
  count: number
  totalDownSeconds: number
}

export interface CompareLighthouseScores {
  performance: number | null
  accessibility: number | null
  bestPractices: number | null
  seo: number | null
}

export interface CompareRow {
  site: { id: number; name: string | null; url: string }
  uptime24h: number | null
  uptime7d: number | null
  uptime30d: number | null
  /** This month's achieved SLA %, or null when the site has no target set. */
  slaAchievedPct: number | null
  slaTarget: number | null
  avgMs: number | null
  p95Ms: number | null
  phases: ComparePhaseAverages
  incidents: CompareIncidentStats
  sslDaysRemaining: number | null
  lighthouse: CompareLighthouseScores
  series: HistoryPoint[]
}

export type NotificationType =
  | 'down'
  | 'up'
  | 'degraded'
  | 'ssl_expiring'
  | 'lighthouse_regression'
  // Domain/certificate watch — see server/utils/domainAlerts.ts and server/utils/notifications.ts.
  | 'domain_expiring'
  | 'nameservers_changed'
  | 'ssl_issuer_changed'
  | 'content_changed'
  // Raised from ingested logs rather than from a check — see server/utils/logs/alerts.ts.
  | 'log_5xx_spike'
  | 'log_php_fatal'
  | 'log_threat_ip'

export type LighthouseFormFactor = 'mobile' | 'desktop'

export interface LighthouseReport {
  id: number
  siteId: number
  measuredAt: string
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

export interface NotificationRow {
  id: number
  siteId: number
  siteName: string | null
  siteUrl: string
  type: NotificationType
  message: string
  createdAt: string
  read: boolean
  dismissed: boolean
}

export type LighthouseJobStatus = 'queued' | 'running' | 'done' | 'error'

export interface LighthouseJob {
  id: string
  siteId: number
  siteLabel: string
  formFactor: LighthouseFormFactor
  status: LighthouseJobStatus
  phase: string | null
  queuedAt: string
  startedAt: string | null
  finishedAt: string | null
  error: string | null
}

/** Progress of the one-at-a-time log ingest run. A single global object, not per folder:
 * ingestion is serialized, so at most one run exists. Shared by the server, the SSE stream
 * (`/api/logs/ingest/events`) and the CLI's heartbeat relay. */
export interface IngestStatus {
  running: boolean
  /** Set once a stop has been asked for and the run hasn't wound down yet. */
  stopRequested: boolean
  /** Why the run is stopping — 'stop' (operator), 'detach' (CLI handoff), or null. */
  stoppedReason: 'stop' | 'detach' | null
  /** Which process is doing the work the status describes. */
  source: 'server' | 'cli'
  startedAt: string | null
  finishedAt: string | null
  filesTotal: number
  filesDone: number
  filesSkipped: number
  currentFile: string | null
  currentFileBytesTotal: number
  currentFileBytesDone: number
  errors: string[]
}

/** Monthly SLA / error-budget figures for one site — see server/utils/db.ts getSlaReport. */
export interface SlaReport {
  /** Month in YYYY-MM. */
  month: string
  /** Percent target, e.g. 99.9. */
  target: number
  /** Achieved availability for the month so far, percent, time-weighted. */
  achievedPct: number
  /** Total time-weighted downtime this month, seconds. */
  downSeconds: number
  /** Downtime the target permits over the elapsed part of the month, seconds. */
  allowedDownSeconds: number
  /** 100 * downSeconds / allowedDownSeconds. Over 100 means the budget is blown. */
  budgetUsedPct: number
  /** Seconds elapsed in the month so far (to now for the current month, to month-end otherwise). */
  elapsedSeconds: number
  incidentCount: number
  /** Mean time to recovery over closed incidents this month, seconds. */
  mttrSeconds: number | null
  /** Mean time between incident starts this month, seconds. */
  mtbfSeconds: number | null
  /** Per-month uptime for the trailing 12 months, oldest first. */
  trailing12: { month: string; uptimePct: number | null }[]
}

export type TriageSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

/** One actionable row on the /triage page — see server/api/triage.get.ts. */
export interface TriageItem {
  id: string
  severity: TriageSeverity
  siteId: number
  siteName: string
  siteUrl: string
  /** Short category label, e.g. 'Incident', 'Cert expiring', 'Stale', 'Log alerts'. */
  kind: string
  /** Human sentence describing the problem. */
  detail: string
  /** ISO timestamp the underlying condition started / was last seen, for an age display. */
  since: string | null
  /** Where the row links — usually the site page, sometimes a log tab. */
  to: string
}
