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
  avgMs: number | null
  p95Ms: number | null
  phases: ComparePhaseAverages
  incidents: CompareIncidentStats
  sslDaysRemaining: number | null
  lighthouse: CompareLighthouseScores
  series: HistoryPoint[]
}

export type NotificationType = 'down' | 'up' | 'degraded' | 'ssl_expiring' | 'lighthouse_regression'

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
