import type { SiteSummary } from '#shared/types'

/** The flat, all-strings-friendly shape the SiteSettingsForm binds to. */
export interface SiteSettingsPayload {
  url: string
  name: string
  checkIntervalSeconds: number
  logSlug: string
  degradedMs: number
  baselineMode: 'fixed' | 'adaptive'
  expectedStatus: string
  acceptedStatuses: string
  slaTarget: string
  httpMethod: string
  requestHeaders: string
  requestBody: string
  authUser: string
  authPass: string
  clearAuthPass: boolean
  timeoutMs: number
  followRedirects: boolean
  contentExpect: string
  contentForbid: string
  contentRegex: string
  contentMinBytes: string
  contentWatch: boolean
  contentWatchSensitivity: number
}

export function emptySiteSettings(): SiteSettingsPayload {
  return {
    url: '',
    name: '',
    checkIntervalSeconds: 300,
    logSlug: '',
    degradedMs: 5000,
    baselineMode: 'fixed',
    expectedStatus: '',
    acceptedStatuses: '',
    slaTarget: '',
    httpMethod: 'GET',
    requestHeaders: '',
    requestBody: '',
    authUser: '',
    authPass: '',
    clearAuthPass: false,
    timeoutMs: 15000,
    followRedirects: true,
    contentExpect: '',
    contentForbid: '',
    contentRegex: '',
    contentMinBytes: '',
    contentWatch: false,
    contentWatchSensitivity: 30,
  }
}

/** Seed the form from an existing site. The stored password is never sent to the client. */
export function siteSettingsFromSite(site: SiteSummary): SiteSettingsPayload {
  return {
    url: site.url,
    name: site.name ?? '',
    checkIntervalSeconds: site.checkIntervalSeconds,
    logSlug: site.logSlug ?? '',
    degradedMs: site.degradedMs,
    baselineMode: site.baselineMode,
    expectedStatus: site.expectedStatus === null ? '' : String(site.expectedStatus),
    acceptedStatuses: site.acceptedStatuses ?? '',
    slaTarget: site.slaTarget === null ? '' : String(site.slaTarget),
    httpMethod: site.httpMethod,
    requestHeaders: site.requestHeaders ? JSON.stringify(site.requestHeaders, null, 2) : '',
    requestBody: site.requestBody ?? '',
    authUser: site.authUser ?? '',
    authPass: '',
    clearAuthPass: false,
    timeoutMs: site.timeoutMs,
    followRedirects: site.followRedirects,
    contentExpect: site.contentExpect ?? '',
    contentForbid: site.contentForbid ?? '',
    contentRegex: site.contentRegex ?? '',
    contentMinBytes: site.contentMinBytes === null ? '' : String(site.contentMinBytes),
    contentWatch: site.contentWatch,
    contentWatchSensitivity: site.contentWatchSensitivity,
  }
}

/** Turn the form payload into the JSON body the sites API expects. */
export function siteSettingsToBody(p: SiteSettingsPayload, opts: { includeUrl?: boolean } = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: p.name.trim() || null,
    checkIntervalSeconds: p.checkIntervalSeconds,
    logSlug: p.logSlug || null,
    degradedMs: p.degradedMs,
    baselineMode: p.baselineMode,
    expectedStatus: p.expectedStatus.trim() === '' ? null : Number(p.expectedStatus),
    acceptedStatuses: p.acceptedStatuses.trim() || null,
    slaTarget: p.slaTarget.trim() === '' ? null : Number(p.slaTarget),
    httpMethod: p.httpMethod,
    requestHeaders: p.requestHeaders.trim() || null,
    requestBody: p.requestBody.trim() || null,
    authUser: p.authUser.trim() || null,
    timeoutMs: p.timeoutMs,
    followRedirects: p.followRedirects,
    contentExpect: p.contentExpect.trim() || null,
    contentForbid: p.contentForbid.trim() || null,
    contentRegex: p.contentRegex.trim() || null,
    contentMinBytes: p.contentMinBytes.trim() === '' ? null : Number(p.contentMinBytes),
    contentWatch: p.contentWatch,
    contentWatchSensitivity: p.contentWatchSensitivity,
  }
  if (opts.includeUrl) body.url = p.url.trim()
  // Password: only send it when the user typed one, or explicitly asked to clear it.
  if (p.clearAuthPass) body.authPass = null
  else if (p.authPass) body.authPass = p.authPass
  return body
}
