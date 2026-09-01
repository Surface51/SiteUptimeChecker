import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../../../scripts/logs-sync/config'

let dir: string
const write = (obj: unknown): string => {
  const p = join(dir, 'log-sync.config.json')
  writeFileSync(p, JSON.stringify(obj))
  return p
}

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'logsync-cfg-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('loadConfig', () => {
  it('applies defaults for an omitted pantheon block', () => {
    const cfg = loadConfig(write({ pantheon: {} }))
    expect(cfg.pantheon).toMatchObject({
      enabled: true, env: 'live', excludePlans: ['Sandbox'], includeDb: true, alias: {},
    })
    expect(cfg.servers).toEqual({})
  })

  it('keeps a supplied alias map and excludePlans', () => {
    const cfg = loadConfig(write({
      pantheon: { excludePlans: ['Sandbox', 'Basic'], alias: { 'charles-ives-society': 'charles-ives' } },
    }))
    expect(cfg.pantheon!.excludePlans).toEqual(['Sandbox', 'Basic'])
    expect(cfg.pantheon!.alias).toEqual({ 'charles-ives-society': 'charles-ives' })
  })

  it('validates a server source and defaults serverDir to the host', () => {
    const cfg = loadConfig(write({
      servers: {
        marchingillini: {
          sources: [{ host: '203.0.113.10', user: 'root', paths: [
            { remote: '/var/log/apache2/access.log', as: 'apache-access.log' },
          ] }],
        },
      },
    }))
    const src = cfg.servers.marchingillini!.sources[0]!
    expect(src.port).toBeUndefined()
    expect(src.serverDir).toBe('203.0.113.10')
    expect(cfg.servers.marchingillini!.env).toBe('live')
  })

  it('accepts an ~/.ssh/config alias as the host with no user or port', () => {
    const cfg = loadConfig(write({
      servers: {
        mi: {
          sources: [{ host: 'marchingillini-web1', paths: [
            { remote: '/var/log/apache2/access.log', as: 'apache-access.log' },
          ] }],
        },
      },
    }))
    const src = cfg.servers.mi!.sources[0]!
    expect(src).toMatchObject({ host: 'marchingillini-web1', serverDir: 'marchingillini-web1' })
    expect(src.user).toBeUndefined()
    expect(src.port).toBeUndefined()
  })

  it('still rejects an empty user when one is given', () => {
    expect(() => loadConfig(write({
      servers: { x: { sources: [{ host: 'alias', user: '', paths: [
        { remote: '/a', as: 'apache-error.log' },
      ] }] } },
    }))).toThrow(/user must be a non-empty string/)
  })

  it('rejects an `as` that is not a recognised log filename', () => {
    expect(() => loadConfig(write({
      servers: { x: { sources: [{ host: 'h', user: 'u', paths: [
        { remote: '/var/log/access.log', as: 'access.log' },
      ] }] } },
    }))).toThrow(/not a recognised log filename/)
  })

  it('rejects a rotated entry whose `as` already carries a date suffix', () => {
    expect(() => loadConfig(write({
      servers: { x: { sources: [{ host: 'h', user: 'u', paths: [
        { remote: '/home/u/logs/*.gz', as: 'apache-access.log-20260101' },
      ] }] } },
    }))).toThrow(/date suffix/)
  })

  it('defaults `rotated` to true for a glob and accepts a base `as`', () => {
    const cfg = loadConfig(write({
      servers: { x: { sources: [{ host: 'h', user: 'u', paths: [
        { remote: '/home/u/logs/site.com-*.gz', as: 'apache-access.log' },
      ] }] } },
    }))
    expect(cfg.servers.x!.sources[0]!.paths[0]).toEqual({
      remote: '/home/u/logs/site.com-*.gz', as: 'apache-access.log', rotated: undefined,
    })
  })

  it('rejects a source with no host', () => {
    expect(() => loadConfig(write({
      servers: { x: { sources: [{ user: 'u', paths: [{ remote: '/a', as: 'apache-error.log' }] }] } },
    }))).toThrow(/host is required/)
  })

  it('reports a missing file clearly', () => {
    expect(() => loadConfig(join(dir, 'nope.json'))).toThrow(/no config at/)
  })
})
