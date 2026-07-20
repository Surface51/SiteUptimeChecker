import dns from 'node:dns'
import type { DnsRecords } from '#shared/types'

const dnsPromises = dns.promises

export async function dnsCheck(hostname: string): Promise<DnsRecords> {
  const t0 = performance.now()
  const result: DnsRecords = { a: [], aaaa: [], resolveMs: null, error: null }

  const [a, aaaa] = await Promise.allSettled([
    dnsPromises.resolve4(hostname),
    dnsPromises.resolve6(hostname),
  ])

  if (a.status === 'fulfilled') result.a = a.value
  if (aaaa.status === 'fulfilled') result.aaaa = aaaa.value

  if (a.status === 'rejected' && aaaa.status === 'rejected') {
    result.error = a.reason?.message || 'DNS resolution failed'
  }

  result.resolveMs = performance.now() - t0
  return result
}
