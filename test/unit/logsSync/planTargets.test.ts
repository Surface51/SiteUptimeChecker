import { describe, it, expect } from 'vitest'
import type { PantheonConfig } from '../../../scripts/logs-sync/config'
import type { PantheonSite } from '../../../scripts/logs-sync/pantheon'
import { buildServerJobs, selectPantheonSites } from '../../../scripts/logs-sync/planTargets'

const pcfg = (over: Partial<PantheonConfig> = {}): PantheonConfig => ({
  enabled: true, env: 'live', excludePlans: ['Sandbox'], include: [], exclude: [],
  alias: {}, includeDb: true, ...over,
})

const sites: PantheonSite[] = [
  { name: 'aaht', id: 'id-aaht', plan_name: 'Basic', frozen: false },
  { name: 'citl', id: 'id-citl', plan_name: 'Performance Large', frozen: false },
  { name: 'lake-land', id: 'id-lake', plan_name: 'Sandbox', frozen: false },
  { name: 'old-thing', id: 'id-old', plan_name: 'Basic', frozen: true },
  { name: 'charles-ives-society', id: 'id-cis', plan_name: 'Performance Small', frozen: false },
]

describe('selectPantheonSites', () => {
  it('drops frozen and excluded-plan sites by default', () => {
    const got = selectPantheonSites(sites, pcfg(), [], new Set())
    expect(got.map((g) => g.folder).sort()).toEqual(['aaht', 'charles-ives-society', 'citl'])
  })

  it('resolves the folder through the alias map', () => {
    const got = selectPantheonSites(sites, pcfg({ alias: { 'charles-ives-society': 'charles-ives' } }), [], new Set())
    expect(got.find((g) => g.site.name === 'charles-ives-society')!.folder).toBe('charles-ives')
  })

  it('honours include as an allow-list', () => {
    const got = selectPantheonSites(sites, pcfg({ include: ['citl'] }), [], new Set())
    expect(got.map((g) => g.site.name)).toEqual(['citl'])
  })

  it('honours a wider excludePlans', () => {
    const got = selectPantheonSites(sites, pcfg({ excludePlans: ['Sandbox', 'Basic'] }), [], new Set())
    expect(got.map((g) => g.site.name).sort()).toEqual(['charles-ives-society', 'citl'])
  })

  it('matches --site against the Pantheon name or the aliased folder', () => {
    const cfg = pcfg({ alias: { 'charles-ives-society': 'charles-ives' } })
    expect(selectPantheonSites(sites, cfg, ['charles-ives'], new Set()).map((g) => g.site.name))
      .toEqual(['charles-ives-society'])
    expect(selectPantheonSites(sites, cfg, ['citl'], new Set()).map((g) => g.site.name))
      .toEqual(['citl'])
  })

  it('skips a folder the operator has paused', () => {
    const got = selectPantheonSites(sites, pcfg(), [], new Set(['aaht']))
    expect(got.map((g) => g.folder)).not.toContain('aaht')
  })
})

describe('buildServerJobs', () => {
  it('makes one job per path entry with the right kind and dest', () => {
    const jobs = buildServerJobs(
      {
        marchingillini: {
          env: 'live',
          sources: [{
            host: '203.0.113.10', user: 'root', port: 22, serverDir: '203.0.113.10',
            paths: [
              { remote: '/var/log/apache2/mi_access.log', as: 'apache-access.log' },
              { remote: '/home/mi/logs/mi-*.gz', as: 'apache-access.log', rotated: true },
            ],
          }],
        },
      },
      '/ingress',
      [],
    )
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({ kind: 'file', destDir: '/ingress/marchingillini/live/203.0.113.10', origin: 'server' })
    expect(jobs[1]).toMatchObject({ kind: 'glob', rotated: true })
    expect(jobs[0]!.ssh).toMatchObject({ host: '203.0.113.10', user: 'root', port: 22, verifyHostKey: true })
  })

  it('carries an ~/.ssh/config alias through with no user or port', () => {
    const jobs = buildServerJobs(
      {
        mi: {
          env: 'live',
          sources: [{
            host: 'marchingillini-web1', serverDir: 'web1',
            paths: [{ remote: '/var/log/apache2/access.log', as: 'apache-access.log' }],
          }],
        },
      },
      '/ingress',
      [],
    )
    expect(jobs[0]!.ssh).toEqual({ host: 'marchingillini-web1', verifyHostKey: true })
    expect(jobs[0]!.destDir).toBe('/ingress/mi/live/web1')
  })

  it('applies the --site filter by folder name', () => {
    const servers = {
      a: { env: 'live', sources: [{ host: 'h1', user: 'u', port: 22, serverDir: 'h1', paths: [{ remote: '/a', as: 'apache-error.log' }] }] },
      b: { env: 'live', sources: [{ host: 'h2', user: 'u', port: 22, serverDir: 'h2', paths: [{ remote: '/b', as: 'apache-error.log' }] }] },
    }
    expect(buildServerJobs(servers, '/ingress', ['b']).map((j) => j.folder)).toEqual(['b'])
  })
})
