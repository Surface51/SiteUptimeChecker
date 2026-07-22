import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import { closeOpenIncident, getDb, getOpenIncident, listIncidents, openIncident } from '../../server/utils/db'

beforeEach(resetDb)

describe('incidents', () => {
  it('has no open incident initially', () => {
    const site = makeSite()
    expect(getOpenIncident(site.id)).toBeNull()
  })

  it('opens an incident with the given cause', () => {
    const site = makeSite()
    openIncident(site.id, 'HTTP 500')
    const open = getOpenIncident(site.id)
    expect(open?.cause).toBe('HTTP 500')
    expect(open?.endedAt).toBeNull()
  })

  it('is idempotent: opening a second incident while one is open does not create a duplicate', () => {
    const site = makeSite()
    openIncident(site.id, 'HTTP 500')
    openIncident(site.id, 'timeout')
    expect(listIncidents(site.id)).toHaveLength(1)
    expect(getOpenIncident(site.id)?.cause).toBe('HTTP 500')
  })

  it('closes the open incident, stamping ended_at', () => {
    const site = makeSite()
    openIncident(site.id, 'HTTP 500')
    closeOpenIncident(site.id)
    expect(getOpenIncident(site.id)).toBeNull()
    const [incident] = listIncidents(site.id)
    expect(incident!.endedAt).not.toBeNull()
  })

  it('allows a new incident to open again after the previous one closed', () => {
    const site = makeSite()
    openIncident(site.id, 'first outage')
    closeOpenIncident(site.id)
    openIncident(site.id, 'second outage')
    expect(listIncidents(site.id)).toHaveLength(2)
    expect(getOpenIncident(site.id)?.cause).toBe('second outage')
  })

  it('computes durationSeconds against now for an open incident', () => {
    const site = makeSite()
    const startedAt = new Date(Date.now() - 90 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    getDb()
      .prepare('INSERT INTO incidents (site_id, started_at, cause) VALUES (?, ?, ?)')
      .run(site.id, startedAt, 'slow')
    const [incident] = listIncidents(site.id)
    expect(incident!.durationSeconds).toBeGreaterThanOrEqual(89)
    expect(incident!.durationSeconds).toBeLessThanOrEqual(91)
  })

  it('computes durationSeconds against ended_at for a closed incident', () => {
    const site = makeSite()
    const startedAt = '2026-01-01 00:00:00'
    const endedAt = '2026-01-01 00:05:00'
    getDb()
      .prepare('INSERT INTO incidents (site_id, started_at, ended_at, cause) VALUES (?, ?, ?, ?)')
      .run(site.id, startedAt, endedAt, 'blip')
    const [incident] = listIncidents(site.id)
    expect(incident!.durationSeconds).toBe(300)
  })
})
