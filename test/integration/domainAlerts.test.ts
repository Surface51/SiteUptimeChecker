import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import {
  getSite,
  insertDnsRecordSet,
  insertMaintenanceWindow,
  insertWhoisRecord,
  listNotifications,
} from '../../server/utils/db'
import { runDomainAlerts } from '../../server/utils/domainAlerts'

beforeEach(resetDb)

const dnsBase = {
  a: [] as string[],
  aaaa: [] as string[],
  mx: [] as string[],
  txt: [] as string[],
  cname: [] as string[],
  soa: [] as string[],
  caa: [] as string[],
  resolveMs: null,
  error: null,
}

function whoisExpiringInDays(siteId: number, days: number) {
  insertWhoisRecord({
    siteId,
    registrar: 'Test Registrar',
    createdDate: null,
    updatedDate: null,
    expiryDate: new Date(Date.now() + days * 86400_000).toISOString(),
    nameServers: [],
    statuses: [],
    raw: null,
    error: null,
  })
}

function types(siteId: number): string[] {
  return listNotifications({ limit: 100, siteId }).map((n) => n.type)
}

describe('runDomainAlerts — domain expiry', () => {
  it('fires domain_expiring when inside a tier, once per tier', () => {
    const site = makeSite()
    whoisExpiringInDays(site.id, 25) // inside the 30-day tier
    runDomainAlerts(getSite(site.id)!)
    runDomainAlerts(getSite(site.id)!) // second pass: cooldown + tier fingerprint suppress it
    expect(types(site.id).filter((t) => t === 'domain_expiring')).toHaveLength(1)
  })

  it('does not fire when expiry is comfortably far out', () => {
    const site = makeSite()
    whoisExpiringInDays(site.id, 120)
    runDomainAlerts(getSite(site.id)!)
    expect(types(site.id)).not.toContain('domain_expiring')
  })

  it('is suppressed during a maintenance window', () => {
    const site = makeSite()
    whoisExpiringInDays(site.id, 3)
    insertMaintenanceWindow({
      siteId: site.id,
      startsAt: new Date(Date.now() - 3600_000).toISOString(),
      endsAt: new Date(Date.now() + 3600_000).toISOString(),
      reason: 'planned',
    })
    runDomainAlerts(getSite(site.id)!)
    expect(types(site.id)).toHaveLength(0)
  })
})

describe('runDomainAlerts — nameserver change', () => {
  it('fires nameservers_changed when the NS set differs from the previous snapshot', () => {
    const site = makeSite()
    insertDnsRecordSet({ ...dnsBase, siteId: site.id, ns: ['ns1.old.net', 'ns2.old.net'] })
    insertDnsRecordSet({ ...dnsBase, siteId: site.id, ns: ['ns1.new.net', 'ns2.new.net'] })
    runDomainAlerts(getSite(site.id)!)
    expect(types(site.id)).toContain('nameservers_changed')
  })

  it('does not fire when the NS set is unchanged (order / case / trailing dot aside)', () => {
    const site = makeSite()
    insertDnsRecordSet({ ...dnsBase, siteId: site.id, ns: ['ns1.example.net', 'ns2.example.net'] })
    insertDnsRecordSet({ ...dnsBase, siteId: site.id, ns: ['NS2.example.net.', 'ns1.example.net'] })
    runDomainAlerts(getSite(site.id)!)
    expect(types(site.id)).not.toContain('nameservers_changed')
  })

  it('does not fire with only a single snapshot', () => {
    const site = makeSite()
    insertDnsRecordSet({ ...dnsBase, siteId: site.id, ns: ['ns1.example.net'] })
    runDomainAlerts(getSite(site.id)!)
    expect(types(site.id)).not.toContain('nameservers_changed')
  })
})
