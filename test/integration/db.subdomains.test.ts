import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import {
  getDb,
  getSubdomainScanState,
  listSubdomains,
  markSubdomainScan,
  setSubdomainIgnored,
  upsertSubdomain,
  type UpsertSubdomainInput,
} from '../../server/utils/db'

beforeEach(resetDb)

function probe(siteId: number, overrides: Partial<UpsertSubdomainInput> = {}): UpsertSubdomainInput {
  return {
    siteId,
    hostname: 'www.example.test',
    sources: ['dns'],
    resolves: true,
    addresses: ['203.0.113.10'],
    cname: null,
    httpStatus: 200,
    finalUrl: 'https://www.example.test/',
    timeTotal: 120,
    sslValid: true,
    sslIssuer: 'Example CA',
    sslExpiresAt: null,
    sslDaysRemaining: 45,
    error: null,
    ...overrides,
  }
}

describe('upsertSubdomain', () => {
  it('inserts a new row and round-trips every field', () => {
    const site = makeSite()
    const row = upsertSubdomain(probe(site.id))
    expect(row.siteId).toBe(site.id)
    expect(row.hostname).toBe('www.example.test')
    expect(row.sources).toEqual(['dns'])
    expect(row.resolves).toBe(true)
    expect(row.addresses).toEqual(['203.0.113.10'])
    expect(row.sslDaysRemaining).toBe(45)
    expect(row.ignored).toBe(false)
  })

  it('preserves first_seen_at and unions sources across repeated scans', () => {
    const site = makeSite()
    const first = upsertSubdomain(probe(site.id, { sources: ['dns'] }))
    const second = upsertSubdomain(probe(site.id, { sources: ['cert'], resolves: false, addresses: [] }))

    expect(second.id).toBe(first.id)
    expect(second.firstSeenAt).toBe(first.firstSeenAt)
    expect(second.lastSeenAt >= first.lastSeenAt).toBe(true)
    expect(new Set(second.sources)).toEqual(new Set(['dns', 'cert']))
    expect(second.resolves).toBe(false)
  })

  it('lists subdomains for a site alphabetically, scoped to that site', () => {
    const site = makeSite()
    const other = makeSite()
    upsertSubdomain(probe(site.id, { hostname: 'staging.example.test' }))
    upsertSubdomain(probe(site.id, { hostname: 'api.example.test' }))
    upsertSubdomain(probe(other.id, { hostname: 'api.other.test' }))

    const rows = listSubdomains(site.id)
    expect(rows.map((r) => r.hostname)).toEqual(['api.example.test', 'staging.example.test'])
  })
})

describe('setSubdomainIgnored', () => {
  it('flips the ignored flag for one hostname without touching others', () => {
    const site = makeSite()
    upsertSubdomain(probe(site.id, { hostname: 'old.example.test' }))
    upsertSubdomain(probe(site.id, { hostname: 'api.example.test' }))

    setSubdomainIgnored(site.id, 'old.example.test', true)

    const rows = listSubdomains(site.id)
    expect(rows.find((r) => r.hostname === 'old.example.test')?.ignored).toBe(true)
    expect(rows.find((r) => r.hostname === 'api.example.test')?.ignored).toBe(false)
  })
})

describe('subdomain scan state', () => {
  it('is null until a scan is recorded, then reflects wildcard status', () => {
    const site = makeSite()
    expect(getSubdomainScanState(site.id)).toBeNull()

    markSubdomainScan(site.id, false)
    expect(getSubdomainScanState(site.id)?.wildcard).toBe(false)

    markSubdomainScan(site.id, true)
    expect(getSubdomainScanState(site.id)?.wildcard).toBe(true)
  })
})

describe('cascade delete', () => {
  it('removes subdomains and scan state when the site is deleted', () => {
    const site = makeSite()
    upsertSubdomain(probe(site.id))
    markSubdomainScan(site.id, false)

    getDb().prepare('DELETE FROM sites WHERE id = ?').run(site.id)

    expect(listSubdomains(site.id)).toEqual([])
    expect(getSubdomainScanState(site.id)).toBeNull()
  })
})
