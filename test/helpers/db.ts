import { rmSync } from 'node:fs'
import { closeDb, getDataDir, insertSite, type InsertCheckInput } from '../../server/utils/db'
import type { CheckStatus, Site } from '#shared/types'

// test/setup.ts (a Vitest `setupFiles` entry, so it runs before this module — or
// any test file — is ever loaded) points UPTIME_DATA_DIR at a throwaway temp dir.
// Fail loudly instead of silently writing to the real .data dir if that wiring
// ever regresses (this previously happened when the override was attempted from
// inside a test file: static `import`s are hoisted above other top-level code, so
// db.ts read process.cwd()/.data before the override could run).
const dataDir = getDataDir()
if (!dataDir.includes('uptime-checker-test-')) {
  throw new Error(
    `Refusing to run DB tests against non-temp data dir "${dataDir}". ` +
      'Expected test/setup.ts to have pointed UPTIME_DATA_DIR at a temp directory before this module loaded.',
  )
}

/**
 * Close and delete the current DB so each test starts from a clean schema.
 * getDb() recreates DATA_DIR (and the schema) lazily on its next call.
 */
export function resetDb() {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
}

let siteCounter = 0

/** Insert a site with sane defaults, overridable per test. */
export function makeSite(overrides: Partial<Parameters<typeof insertSite>[0]> = {}): Site {
  siteCounter += 1
  return insertSite({
    url: `https://example${siteCounter}.test/`,
    name: null,
    checkIntervalSeconds: 300,
    ...overrides,
  })
}

/** Build a minimal insertCheck() input for a given site/status, overridable per test. */
export function makeCheckInput(
  siteId: number,
  status: CheckStatus,
  overrides: Partial<InsertCheckInput> = {},
): InsertCheckInput {
  return {
    siteId,
    status,
    httpStatus: status === 'down' ? 500 : 200,
    error: null,
    timeDns: null,
    timeTcp: null,
    timeTls: null,
    timeTtfb: null,
    timeTotal: 100,
    sslValid: null,
    sslIssuer: null,
    sslExpiresAt: null,
    sslDaysRemaining: null,
    pageTitle: null,
    contentLength: null,
    contentType: null,
    redirectChain: [],
    securityHeaders: null,
    dnsRecords: null,
    responseHeaders: {},
    ...overrides,
  }
}
