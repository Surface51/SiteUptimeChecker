import { beforeEach, describe, expect, it } from 'vitest'
import { makeCheckInput, makeSite, resetDb } from '../helpers/db'
import { getDb, insertCheck, openIncident, updateSite } from '../../server/utils/db'
import { buildTriage } from '../../server/utils/triage'

beforeEach(resetDb)

function rawCheck(siteId: number, status: string, checkedAt: string) {
  getDb()
    .prepare('INSERT INTO checks (site_id, status, checked_at) VALUES (?, ?, ?)')
    .run(siteId, status, checkedAt)
}

describe('buildTriage', () => {
  it('is empty for a healthy fleet', () => {
    const site = makeSite()
    insertCheck(makeCheckInput(site.id, 'up'))
    expect(buildTriage()).toEqual([])
  })

  it('ranks an open incident (critical) ahead of a degraded check (medium)', () => {
    const downSite = makeSite({ name: 'Down One' })
    insertCheck(makeCheckInput(downSite.id, 'down'))
    openIncident(downSite.id, 'HTTP 500')

    const degradedSite = makeSite({ name: 'Slow One' })
    insertCheck(makeCheckInput(degradedSite.id, 'degraded'))

    const items = buildTriage()
    expect(items[0]!.severity).toBe('critical')
    expect(items[0]!.kind).toBe('Incident')
    expect(items.some((i) => i.kind === 'Degraded' && i.severity === 'medium')).toBe(true)
    // Incident sorts before Degraded.
    expect(items.findIndex((i) => i.kind === 'Incident')).toBeLessThan(
      items.findIndex((i) => i.kind === 'Degraded'),
    )
  })

  it('flags a paused site as info and skips its other checks', () => {
    const site = makeSite({ name: 'Paused' })
    insertCheck(makeCheckInput(site.id, 'down'))
    updateSite(site.id, { enabled: false })
    const items = buildTriage().filter((i) => i.siteId === site.id)
    expect(items).toHaveLength(1)
    expect(items[0]!.kind).toBe('Paused')
    expect(items[0]!.severity).toBe('info')
  })

  it('detects a stale monitor (no check within 2.5x the interval)', () => {
    const site = makeSite({ checkIntervalSeconds: 300 })
    const stale = new Date(Date.now() - 40 * 60_000).toISOString().slice(0, 19).replace('T', ' ')
    rawCheck(site.id, 'up', stale)
    const items = buildTriage().filter((i) => i.siteId === site.id)
    expect(items.some((i) => i.kind === 'Stale')).toBe(true)
  })

  it('reports a blown SLA budget', () => {
    const site = makeSite({ name: 'SLA site' })
    insertCheck(makeCheckInput(site.id, 'up'))
    updateSite(site.id, { slaTarget: 99.999 })
    // ~1h of downtime this month blows a 99.999% budget easily.
    getDb()
      .prepare('INSERT INTO incidents (site_id, started_at, ended_at) VALUES (?, ?, ?)')
      .run(
        site.id,
        new Date(Date.now() - 2 * 3600_000).toISOString().slice(0, 19).replace('T', ' '),
        new Date(Date.now() - 1 * 3600_000).toISOString().slice(0, 19).replace('T', ' '),
      )
    expect(buildTriage().some((i) => i.kind === 'SLA budget')).toBe(true)
  })
})
