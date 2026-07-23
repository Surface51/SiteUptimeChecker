import dns from 'node:dns'
import type { DnsRecordSet } from '#shared/types'

const dnsPromises = dns.promises

export type DnsRecordSetResult = Omit<DnsRecordSet, 'id' | 'siteId' | 'checkedAt'>

function formatMx(records: dns.MxRecord[]): string[] {
  return records
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((r) => `${r.priority} ${r.exchange}`)
}

function formatSoa(soa: dns.SoaRecord): string[] {
  return [
    `${soa.nsname} ${soa.hostmaster} serial=${soa.serial} refresh=${soa.refresh} retry=${soa.retry} expire=${soa.expire} minttl=${soa.minttl}`,
  ]
}

function formatCaa(records: dns.CaaRecord[]): string[] {
  return records.map((r) => {
    const value = r.issue ?? r.issuewild ?? r.iodef ?? ''
    return `${r.critical ? 'critical ' : ''}${value}`.trim()
  })
}

/** Resolves the full set of DNS record types for a hostname, once a week per site. */
export async function runDnsRecords(hostname: string): Promise<DnsRecordSetResult> {
  const t0 = performance.now()

  const [a, aaaa, ns, mx, txt, cname, soa, caa] = await Promise.allSettled([
    dnsPromises.resolve4(hostname),
    dnsPromises.resolve6(hostname),
    dnsPromises.resolveNs(hostname),
    dnsPromises.resolveMx(hostname),
    dnsPromises.resolveTxt(hostname),
    dnsPromises.resolveCname(hostname),
    dnsPromises.resolveSoa(hostname),
    dnsPromises.resolveCaa(hostname),
  ])

  const settled = [a, aaaa, ns, mx, txt, cname, soa, caa]
  const allRejected = settled.every((r) => r.status === 'rejected')

  return {
    a: a.status === 'fulfilled' ? a.value : [],
    aaaa: aaaa.status === 'fulfilled' ? aaaa.value : [],
    ns: ns.status === 'fulfilled' ? ns.value : [],
    mx: mx.status === 'fulfilled' ? formatMx(mx.value) : [],
    txt: txt.status === 'fulfilled' ? txt.value.map((chunks) => chunks.join('')) : [],
    cname: cname.status === 'fulfilled' ? cname.value : [],
    soa: soa.status === 'fulfilled' ? formatSoa(soa.value) : [],
    caa: caa.status === 'fulfilled' ? formatCaa(caa.value) : [],
    resolveMs: performance.now() - t0,
    error: allRejected ? (a.status === 'rejected' && a.reason?.message) || 'DNS resolution failed' : null,
  }
}
