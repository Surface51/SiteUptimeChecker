import type { CheckRow, Site } from '#shared/types'
import {
  closeOpenIncident,
  getLatestCheck,
  getResponseBaselineMs,
  getSiteSecrets,
  insertCheck,
  insertNotification,
  isInMaintenance,
  openIncident,
  setSiteBodyChunks,
} from '../db'
import { detectAndNotify } from '../notifications'
import { claimAlert } from '../alertState'
import { evaluateAssertions, hasAnyAssertion, type AssertionConfig } from './assertions'
import { bodyHashOf, chunkHashes, compareChunks } from './contentDiff'
import { determineStatus } from './status'
import { dnsCheck } from './dnsCheck'
import { httpCheck } from './httpCheck'
import { evaluateSecurityHeaders } from './securityHeaders'
import { sslCheck } from './sslCheck'

// Adaptive baseline: flag once a response is this many times the trailing-median p95, but never
// below the floor (so a 40ms site doesn't alert on a 90ms blip).
const ADAPTIVE_FACTOR = 2
const ADAPTIVE_FLOOR_MS = 500

// Assertions / content-watch want more of the body than the 64KB the title scan needs.
const SCAN_BYTES_DEFAULT = 65_536
const SCAN_BYTES_DEEP = 262_144

function resolveDegradedThreshold(site: Site): number {
  if (site.baselineMode !== 'adaptive') return site.degradedMs
  const baseline = getResponseBaselineMs(site.id)
  if (baseline === null) return site.degradedMs // not enough rollup history yet
  return Math.max(baseline * ADAPTIVE_FACTOR, ADAPTIVE_FLOOR_MS)
}

export async function runCheck(site: Site): Promise<CheckRow> {
  const startUrl = new URL(site.url)
  const secrets = getSiteSecrets(site.id)

  const assertionCfg: AssertionConfig = {
    expect: site.contentExpect,
    forbid: site.contentForbid,
    regex: site.contentRegex,
    minBytes: site.contentMinBytes,
  }
  const wantsBody = hasAnyAssertion(assertionCfg) || site.contentWatch
  const scanBytes = wantsBody ? SCAN_BYTES_DEEP : SCAN_BYTES_DEFAULT

  const httpResult = await httpCheck(startUrl, {
    method: site.httpMethod,
    headers: site.requestHeaders,
    body: site.requestBody,
    authUser: site.authUser,
    authPass: secrets.authPass,
    timeoutMs: site.timeoutMs,
    followRedirects: site.followRedirects,
    bodyScanBytes: scanBytes,
  })

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

  const assertion = httpResult.error
    ? { failed: false, detail: null }
    : evaluateAssertions(httpResult.bodyText, httpResult.contentLength, assertionCfg)

  const degradedThresholdMs = resolveDegradedThreshold(site)

  const status = determineStatus({
    expectedStatus: site.expectedStatus,
    acceptedStatuses: site.acceptedStatuses,
    httpStatus: httpResult.httpStatus,
    error: httpResult.error,
    timeTotal: httpResult.timeTotal,
    degradedMs: degradedThresholdMs,
    sslDaysRemaining: ssl?.daysRemaining ?? null,
    assertionFailed: assertion.failed,
  })

  const previous = getLatestCheck(site.id)

  const bodyHash = httpResult.bodyText ? bodyHashOf(httpResult.bodyText) : null

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
    assertionFailed: assertion.failed,
    assertionDetail: assertion.detail,
    bodyHash,
    degradedThresholdMs,
  })

  const inMaintenance = isInMaintenance(site.id)

  if (!inMaintenance) {
    if (status === 'down' && previous?.status !== 'down') {
      const cause = assertion.failed
        ? `assertion failed: ${assertion.detail}`
        : check.httpStatus
          ? `HTTP ${check.httpStatus}`
          : check.error || 'unreachable'
      openIncident(site.id, cause)
    } else if (status !== 'down' && previous?.status === 'down') {
      closeOpenIncident(site.id)
    }

    detectAndNotify(site, previous, check)

    if (site.contentWatch && httpResult.bodyText) {
      evaluateContentWatch(site, httpResult.bodyText, secrets.bodyChunks)
    }
  }

  return check
}

/**
 * Chunk-hash the body, compare to the stored reference, and raise `content_changed` when the
 * differing-chunk ratio clears the site's sensitivity. The reference is (re)seeded on the first
 * check and after any accepted change, so one defacement alerts once rather than every probe.
 */
function evaluateContentWatch(site: Site, body: string, reference: string[] | null): void {
  const current = chunkHashes(body)
  if (!reference || reference.length === 0) {
    setSiteBodyChunks(site.id, current)
    return
  }
  const change = compareChunks(reference, current)
  if (change.percent >= site.contentWatchSensitivity) {
    const label = site.name || site.url
    const bodyHash = bodyHashOf(body)
    if (claimAlert(site.id, 'content_changed', bodyHash, 24)) {
      insertNotification({
        siteId: site.id,
        type: 'content_changed',
        message: `${label} page content changed by ~${change.percent}% since the last snapshot.`,
      })
    }
    setSiteBodyChunks(site.id, current)
  }
}
