import { whoisDomain } from 'whoiser'

// whoiser's public entry point only exports the functions, not its `DomainWhoisData` type, so
// derive the per-server result shape from the function signature instead of importing it.
type DomainWhoisData = Awaited<ReturnType<typeof whoisDomain>>[string]

export interface WhoisLookupResult {
  registrar: string | null
  createdDate: string | null
  updatedDate: string | null
  expiryDate: string | null
  nameServers: string[]
  statuses: string[]
  raw: string | null
  error: string | null
}

function firstValue(...values: (string | string[] | undefined)[]): string | null {
  for (const value of values) {
    if (Array.isArray(value)) {
      if (value.length && value[0]) return value[0]
      continue
    }
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * whoiser follows the referral chain registry -> registrar, returning one entry per server
 * queried (in query order). The registrar's own server usually has the richer/more accurate
 * data (creation/expiry dates, registrar name, statuses), so later entries win on conflict.
 */
export async function runWhois(hostname: string): Promise<WhoisLookupResult> {
  try {
    const servers = await whoisDomain(hostname, { follow: 2, timeout: 10_000 })

    let registrar: string | null = null
    let createdDate: string | null = null
    let updatedDate: string | null = null
    let expiryDate: string | null = null
    const nameServers = new Set<string>()
    const statuses = new Set<string>()
    const rawParts: string[] = []

    for (const data of Object.values(servers) as DomainWhoisData[]) {
      registrar = firstValue(data['Registrar'], data['Sponsoring Registrar']) ?? registrar
      createdDate = firstValue(data['Creation Date'], data['Created Date'], data['Registered On']) ?? createdDate
      updatedDate = firstValue(data['Updated Date'], data['Last Updated On']) ?? updatedDate
      expiryDate =
        firstValue(
          data['Registry Expiry Date'],
          data['Expiry Date'],
          data['Registrar Registration Expiration Date'],
        ) ?? expiryDate
      for (const ns of toArray(data['Name Server'])) nameServers.add(ns.toLowerCase())
      for (const status of toArray(data['Domain Status'])) statuses.add(status)
      if (Array.isArray(data.text) && data.text.length) rawParts.push(data.text.join('\n'))
    }

    return {
      registrar,
      createdDate,
      updatedDate,
      expiryDate,
      nameServers: [...nameServers],
      statuses: [...statuses],
      raw: rawParts.length ? rawParts.join('\n\n---\n\n') : null,
      error: null,
    }
  } catch (err: any) {
    return {
      registrar: null,
      createdDate: null,
      updatedDate: null,
      expiryDate: null,
      nameServers: [],
      statuses: [],
      raw: null,
      error: err?.message || 'WHOIS lookup failed',
    }
  }
}
