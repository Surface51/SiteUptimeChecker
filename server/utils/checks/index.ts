import type { CheckRow, Site } from '#shared/types'
import { closeOpenIncident, getLatestCheck, insertCheck, isInMaintenance, openIncident } from '../db'
import { detectAndNotify } from '../notifications'
import { determineStatus } from './status'
import { dnsCheck } from './dnsCheck'
import { httpCheck } from './httpCheck'
import { evaluateSecurityHeaders } from './securityHeaders'
import { sslCheck } from './sslCheck'

export async function runCheck(site: Site): Promise<CheckRow> {
  const startUrl = new URL(site.url)
  const httpResult = await httpCheck(startUrl)

  let ssl = httpResult.ssl
  if (!ssl && startUrl.protocol === 'https:') {
    let finalHost = startUrl.hostname
    try {
      finalHost = new URL(httpResult.finalUrl).hostname
    } catch {
      // keep startUrl hostname
    }
    ssl = await sslCheck(finalHost)
  }

  const dnsResult = await dnsCheck(startUrl.hostname)
  const securityHeaders = httpResult.error ? null : evaluateSecurityHeaders(httpResult.responseHeaders)

  const status = determineStatus({
    expectedStatus: site.expectedStatus,
    httpStatus: httpResult.httpStatus,
    error: httpResult.error,
    timeTotal: httpResult.timeTotal,
    degradedMs: site.degradedMs,
    sslDaysRemaining: ssl?.daysRemaining ?? null,
  })

  const previous = getLatestCheck(site.id)

  const check = insertCheck({
    siteId: site.id,
    status,
    httpStatus: httpResult.httpStatus,
    error: httpResult.error,
    timeDns: httpResult.timeDns,
    timeTcp: httpResult.timeTcp,
    timeTls: httpResult.timeTls,
    timeTtfb: httpResult.timeTtfb,
    timeTotal: httpResult.timeTotal,
    sslValid: ssl?.valid ?? null,
    sslIssuer: ssl?.issuer ?? null,
    sslExpiresAt: ssl?.expiresAt ?? null,
    sslDaysRemaining: ssl?.daysRemaining ?? null,
    pageTitle: httpResult.pageTitle,
    contentLength: httpResult.contentLength,
    contentType: httpResult.contentType,
    redirectChain: httpResult.redirectChain,
    securityHeaders,
    dnsRecords: dnsResult,
    responseHeaders: httpResult.responseHeaders,
  })

  const inMaintenance = isInMaintenance(site.id)

  if (!inMaintenance) {
    if (status === 'down' && previous?.status !== 'down') {
      const cause = check.httpStatus ? `HTTP ${check.httpStatus}` : check.error || 'unreachable'
      openIncident(site.id, cause)
    } else if (status !== 'down' && previous?.status === 'down') {
      closeOpenIncident(site.id)
    }

    detectAndNotify(site, previous, check)
  }

  return check
}
