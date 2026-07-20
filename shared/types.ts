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
}

export interface HistoryPoint {
  checkedAt: string
  status: CheckStatus
  httpStatus: number | null
  timeTotal: number | null
  timeTtfb: number | null
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

export type NotificationType = 'down' | 'up' | 'degraded' | 'ssl_expiring'

export interface NotificationRow {
  id: number
  siteId: number
  siteName: string | null
  siteUrl: string
  type: NotificationType
  message: string
  createdAt: string
  read: boolean
}
