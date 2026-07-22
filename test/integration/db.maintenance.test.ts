import { beforeEach, describe, expect, it } from 'vitest'
import { makeSite, resetDb } from '../helpers/db'
import {
  deleteMaintenanceWindow,
  insertMaintenanceWindow,
  isInMaintenance,
  listMaintenanceWindows,
} from '../../server/utils/db'

beforeEach(resetDb)

describe('maintenance windows', () => {
  it('is not in maintenance when no windows exist', () => {
    const site = makeSite()
    expect(isInMaintenance(site.id)).toBe(false)
  })

  it('is in maintenance when "now" falls inside a window', () => {
    const site = makeSite()
    insertMaintenanceWindow({
      siteId: site.id,
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2999-01-01T00:00:00.000Z',
      reason: 'ongoing',
    })
    expect(isInMaintenance(site.id)).toBe(true)
  })

  it('is not in maintenance outside the window', () => {
    const site = makeSite()
    insertMaintenanceWindow({
      siteId: site.id,
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2020-01-02T00:00:00.000Z',
      reason: 'past',
    })
    expect(isInMaintenance(site.id)).toBe(false)
  })

  it('treats the window boundaries as inclusive', () => {
    const site = makeSite()
    insertMaintenanceWindow({
      siteId: site.id,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-01-01T01:00:00.000Z',
      reason: 'exact',
    })
    expect(isInMaintenance(site.id, '2026-01-01T00:00:00.000Z')).toBe(true)
    expect(isInMaintenance(site.id, '2026-01-01T01:00:00.000Z')).toBe(true)
    expect(isInMaintenance(site.id, '2026-01-01T01:00:00.001Z')).toBe(false)
  })

  it('checks maintenance status at an explicit point in time', () => {
    const site = makeSite()
    insertMaintenanceWindow({
      siteId: site.id,
      startsAt: '2020-06-01T00:00:00.000Z',
      endsAt: '2020-06-02T00:00:00.000Z',
      reason: 'scheduled',
    })
    expect(isInMaintenance(site.id, '2020-06-01T12:00:00.000Z')).toBe(true)
    expect(isInMaintenance(site.id, '2020-06-03T00:00:00.000Z')).toBe(false)
  })

  it('scopes maintenance windows to their own site', () => {
    const siteA = makeSite()
    const siteB = makeSite()
    insertMaintenanceWindow({
      siteId: siteA.id,
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2999-01-01T00:00:00.000Z',
      reason: 'A only',
    })
    expect(isInMaintenance(siteA.id)).toBe(true)
    expect(isInMaintenance(siteB.id)).toBe(false)
  })

  it('lists and deletes maintenance windows', () => {
    const site = makeSite()
    const window = insertMaintenanceWindow({
      siteId: site.id,
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2020-01-02T00:00:00.000Z',
      reason: 'temp',
    })
    expect(listMaintenanceWindows(site.id)).toHaveLength(1)
    deleteMaintenanceWindow(window.id)
    expect(listMaintenanceWindows(site.id)).toHaveLength(0)
  })
})
