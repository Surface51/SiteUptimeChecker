import { describe, it, expect } from 'vitest'
import { extractDate, isGlob, localNameFor, ymd } from '../../../scripts/logs-sync/rotateName'

describe('isGlob', () => {
  it('detects shell metacharacters', () => {
    expect(isGlob('/home/mi/logs/site.com-*.gz')).toBe(true)
    expect(isGlob('/home/mi/logs/site.com-[0-9].gz')).toBe(true)
    expect(isGlob('/home/mi/logs/error_log')).toBe(false)
  })
})

describe('extractDate', () => {
  it('reads YYYYMMDD', () => {
    expect(extractDate('nginx-access.log-20260806.gz')).toBe('20260806')
  })
  it('reads YYYY-MM-DD and YYYY.MM.DD', () => {
    expect(extractDate('access.log-2026-08-06')).toBe('20260806')
    expect(extractDate('access.2026.08.06.gz')).toBe('20260806')
  })
  it('reads cPanel Mon-YYYY as the 1st of the month', () => {
    expect(extractDate('marchingillini.com-Aug-2026.gz')).toBe('20260801')
  })
  it('returns null when there is no date', () => {
    expect(extractDate('error_log')).toBeNull()
    expect(extractDate('marchingillini.com')).toBeNull()
  })
})

describe('localNameFor', () => {
  const mtime = new Date('2026-07-15T09:00:00Z')

  it('returns `as` verbatim when not rotated', () => {
    expect(localNameFor('apache-access.log', 'marchingillini.com', mtime, false)).toBe('apache-access.log')
  })

  it('appends the basename date and keeps .gz', () => {
    expect(localNameFor('apache-access.log', 'site.com-20260806.gz', mtime, true))
      .toBe('apache-access.log-20260806.gz')
  })

  it('appends without .gz when the remote is not gzipped', () => {
    expect(localNameFor('apache-access.log', 'site.com-20260806', mtime, true))
      .toBe('apache-access.log-20260806')
  })

  it('falls back to the mtime day when the basename has no date', () => {
    expect(localNameFor('apache-access.log', 'error_log.1', mtime, true))
      .toBe(`apache-access.log-${ymd(mtime)}`)
    expect(ymd(mtime)).toBe('20260715')
  })

  it('does not double the .gz when `as` itself carries one', () => {
    expect(localNameFor('apache-access.log.gz', 'site.com-20260806.gz', mtime, true))
      .toBe('apache-access.log-20260806.gz')
  })
})
