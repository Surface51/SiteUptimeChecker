import type { Site } from '#shared/types'
import { claimAlert } from './alertState'
import { getLatestWhoisRecord, getRecentDnsRecordSets, insertNotification, isInMaintenance } from './db'

// Days-remaining tiers a domain-expiry alert fires at. The tier is the alert fingerprint, so
// each one notifies at most once even though the weekly WHOIS refresh keeps re-observing it.
const EXPIRY_TIERS = [60, 30, 14, 7]

function daysUntil(dateStr: string): number | null {
  const t = Date.parse(dateStr)
  if (Number.isNaN(t)) return null
  return Math.floor((t - Date.now()) / 86_400_000)
}

function normaliseNs(list: string[]): string[] {
  return [...new Set(list.map((n) => n.trim().toLowerCase().replace(/\.$/, '')))].sort()
}

/**
 * Turns the freshly-stored WHOIS + DNS snapshots for a site into notifications:
 *   - domain_expiring     — registry expiry inside a 60/30/14/7-day tier
 *   - nameservers_changed — the NS set differs from the previous snapshot
 *
 * Called at the end of runDomainInfoNow (weekly per site). Never throws into its caller.
 * Suppressed entirely while the site is in a maintenance window, like the check-derived alerts.
 */
export function runDomainAlerts(site: Site): void {
  try {
    if (isInMaintenance(site.id)) return
    const label = site.name || site.url

    const whois = getLatestWhoisRecord(site.id)
    if (whois?.expiryDate) {
      const days = daysUntil(whois.expiryDate)
      if (days !== null) {
        const tier = EXPIRY_TIERS.find((t) => days <= t)
        if (tier !== undefined && claimAlert(site.id, 'domain_expiring', `${tier}d`, 24)) {
          insertNotification({
            siteId: site.id,
            type: 'domain_expiring',
            message:
              days < 0
                ? `${label} domain registration has EXPIRED (${whois.expiryDate}).`
                : `${label} domain registration expires in ${days} day${days === 1 ? '' : 's'} (${whois.expiryDate}).`,
          })
        }
      }
    }

    const [latest, prev] = getRecentDnsRecordSets(site.id, 2)
    if (latest && prev && latest.ns.length && prev.ns.length) {
      const a = normaliseNs(latest.ns)
      const b = normaliseNs(prev.ns)
      if (a.join('|') !== b.join('|') && claimAlert(site.id, 'nameservers_changed', a.join('|'), 24)) {
        insertNotification({
          siteId: site.id,
          type: 'nameservers_changed',
          message: `${label} nameservers changed: ${b.join(', ')} → ${a.join(', ')}`,
        })
      }
    }
  } catch (err) {
    console.error(`[domain-alerts] failed for site ${site.id}:`, err)
  }
}
