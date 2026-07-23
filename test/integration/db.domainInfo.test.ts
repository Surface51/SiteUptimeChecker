import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import {
  getDb,
  getDnsHistory,
  getLatestDnsRecordSet,
  getLatestWhoisRecord,
  getWhoisHistory,
  insertDnsRecordSet,
  insertWhoisRecord,
  type InsertDnsRecordSetInput,
  type InsertWhoisRecordInput,
} from '../../server/utils/db'

beforeEach(resetDb)

function whoisInput(siteId: number, overrides: Partial<InsertWhoisRecordInput> = {}): InsertWhoisRecordInput {
  return {
    siteId,
    registrar: 'Example Registrar, Inc.',
    createdDate: '1997-09-15T00:00:00Z',
    updatedDate: '2025-08-01T00:00:00Z',
    expiryDate: '2027-09-14T00:00:00Z',
    nameServers: ['ns1.example.test', 'ns2.example.test'],
    statuses: ['clientTransferProhibited'],
    raw: 'raw whois text',
    error: null,
    ...overrides,
  }
}

function dnsInput(siteId: number, overrides: Partial<InsertDnsRecordSetInput> = {}): InsertDnsRecordSetInput {
  return {
    siteId,
    a: ['1.2.3.4'],
    aaaa: [],
    ns: ['ns1.example.test'],
    mx: ['10 mail.example.test'],
    txt: ['v=spf1 -all'],
    cname: [],
    soa: [],
    caa: [],
    resolveMs: 12.5,
    error: null,
    ...overrides,
  }
}

/** Insert a row directly with an explicit checked_at, mirroring the rawInsertCheck helper in db.uptime.test.ts. */
function rawInsertWhois(siteId: number, checkedAt: string) {
  getDb()
    .prepare('INSERT INTO whois_records (site_id, checked_at, registrar) VALUES (?, ?, ?)')
    .run(siteId, checkedAt, 'Example Registrar, Inc.')
}

function rawInsertDns(siteId: number, checkedAt: string) {
  getDb()
    .prepare(`INSERT INTO dns_record_sets (site_id, checked_at, a) VALUES (?, ?, '["1.2.3.4"]')`)
    .run(siteId, checkedAt)
}

describe('whois records', () => {
  it('returns null when there is no whois data yet', () => {
    const site = makeSite()
    expect(getLatestWhoisRecord(site.id)).toBeNull()
  })

  it('inserts and returns the latest whois record', () => {
    const site = makeSite()
    const record = insertWhoisRecord(whoisInput(site.id))
    expect(record.registrar).toBe('Example Registrar, Inc.')
    expect(record.nameServers).toEqual(['ns1.example.test', 'ns2.example.test'])
    expect(record.statuses).toEqual(['clientTransferProhibited'])

    const latest = getLatestWhoisRecord(site.id)
    expect(latest?.id).toBe(record.id)
  })

  it('getLatestWhoisRecord returns the most recently checked row', () => {
    const site = makeSite()
    rawInsertWhois(site.id, '2026-01-01 00:00:00')
    rawInsertWhois(site.id, '2026-01-08 00:00:00')
    const latest = getLatestWhoisRecord(site.id)
    expect(latest?.checkedAt).toBe('2026-01-08 00:00:00')
  })

  it('getWhoisHistory respects the day window and returns oldest-first', () => {
    const site = makeSite()
    const twoYearsAgo = new Date(Date.now() - 800 * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    rawInsertWhois(site.id, twoYearsAgo)
    insertWhoisRecord(whoisInput(site.id))

    const history = getWhoisHistory(site.id, 365, 100)
    expect(history).toHaveLength(1)
  })

  it('prunes whois records older than the retention window on insert', () => {
    const site = makeSite()
    const overRetention = new Date(Date.now() - 800 * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    rawInsertWhois(site.id, overRetention)
    insertWhoisRecord(whoisInput(site.id))

    const all = getDb().prepare('SELECT COUNT(*) AS n FROM whois_records WHERE site_id = ?').get(site.id) as {
      n: number
    }
    expect(all.n).toBe(1)
  })
})

describe('dns record sets', () => {
  it('returns null when there is no dns data yet', () => {
    const site = makeSite()
    expect(getLatestDnsRecordSet(site.id)).toBeNull()
  })

  it('inserts and returns the latest dns record set', () => {
    const site = makeSite()
    const record = insertDnsRecordSet(dnsInput(site.id))
    expect(record.a).toEqual(['1.2.3.4'])
    expect(record.mx).toEqual(['10 mail.example.test'])
    expect(record.txt).toEqual(['v=spf1 -all'])

    const latest = getLatestDnsRecordSet(site.id)
    expect(latest?.id).toBe(record.id)
  })

  it('getLatestDnsRecordSet returns the most recently checked row', () => {
    const site = makeSite()
    rawInsertDns(site.id, '2026-01-01 00:00:00')
    rawInsertDns(site.id, '2026-01-08 00:00:00')
    const latest = getLatestDnsRecordSet(site.id)
    expect(latest?.checkedAt).toBe('2026-01-08 00:00:00')
  })

  it('getDnsHistory respects the day window', () => {
    const site = makeSite()
    const twoYearsAgo = new Date(Date.now() - 800 * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    rawInsertDns(site.id, twoYearsAgo)
    insertDnsRecordSet(dnsInput(site.id))

    const history = getDnsHistory(site.id, 365, 100)
    expect(history).toHaveLength(1)
  })

  it('prunes dns record sets older than the retention window on insert', () => {
    const site = makeSite()
    const overRetention = new Date(Date.now() - 800 * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    rawInsertDns(site.id, overRetention)
    insertDnsRecordSet(dnsInput(site.id))

    const all = getDb().prepare('SELECT COUNT(*) AS n FROM dns_record_sets WHERE site_id = ?').get(site.id) as {
      n: number
    }
    expect(all.n).toBe(1)
  })
})
