import { describe, expect, it } from 'vitest'
import {
  detectWildcard,
  discoverSubdomains,
  probeSubdomain,
  rankAndCapCandidates,
  scanRoot,
} from '../../server/utils/subdomains'
import type { SslInfo } from '../../server/utils/checks/sslCheck'

function sslInfo(overrides: Partial<SslInfo> = {}): SslInfo {
  return { valid: true, issuer: 'Example CA', expiresAt: null, daysRemaining: 90, altNames: [], ...overrides }
}

const rejects = () => Promise.reject(new Error('ENOTFOUND'))

describe('scanRoot', () => {
  it('strips a leading www.', () => {
    expect(scanRoot('www.example.com')).toBe('example.com')
  })

  it('leaves a bare root domain unchanged', () => {
    expect(scanRoot('example.com')).toBe('example.com')
  })

  it('lowercases the hostname', () => {
    expect(scanRoot('WWW.Example.COM')).toBe('example.com')
  })

  it('does not strip www from within a longer label', () => {
    expect(scanRoot('wwwexample.com')).toBe('wwwexample.com')
  })
})

describe('detectWildcard', () => {
  it('is true when the random probe label resolves', async () => {
    const resolve4 = () => Promise.resolve(['203.0.113.1'])
    expect(await detectWildcard('example.com', resolve4)).toBe(true)
  })

  it('is false when the random probe label does not resolve', async () => {
    expect(await detectWildcard('example.com', rejects)).toBe(false)
  })
})

describe('discoverSubdomains', () => {
  it('collects cert SANs, DNS wordlist hits and CT names, scoped to the root', async () => {
    const found = await discoverSubdomains('example.com', {
      transports: {
        sslCheck: async () => sslInfo({ altNames: ['api.example.com', 'other-domain.test'] }),
        resolve4: (h) => (h === 'www.example.com' ? Promise.resolve(['203.0.113.1']) : rejects()),
        resolve6: rejects,
        resolveCname: rejects,
        fetchCt: async () => [{ name_value: 'staging.example.com\nold.example.com' }],
      },
    })

    expect(found.get('api.example.com')).toEqual(new Set(['cert']))
    expect(found.get('www.example.com')).toEqual(new Set(['dns']))
    expect(found.get('staging.example.com')).toEqual(new Set(['ct']))
    expect(found.get('old.example.com')).toEqual(new Set(['ct']))
    // Not a subdomain of the root at all — must not leak in.
    expect(found.has('other-domain.test')).toBe(false)
  })

  it('unions sources when a name is found more than one way', async () => {
    const found = await discoverSubdomains('example.com', {
      transports: {
        sslCheck: async () => sslInfo({ altNames: ['www.example.com'] }),
        resolve4: () => Promise.resolve(['203.0.113.1']),
        resolve6: rejects,
        resolveCname: rejects,
        fetchCt: async () => [{ name_value: 'www.example.com' }],
      },
    })
    expect(found.get('www.example.com')).toEqual(new Set(['cert', 'dns', 'ct']))
  })

  it('drops wildcard entries and the bare root itself', async () => {
    const found = await discoverSubdomains('example.com', {
      transports: {
        sslCheck: async () => sslInfo({ altNames: ['*.example.com', 'example.com'] }),
        resolve4: rejects,
        resolve6: rejects,
        resolveCname: rejects,
        fetchCt: async () => [],
      },
    })
    expect(found.size).toBe(0)
  })

  it('skips the wordlist when includeWordlist is false', async () => {
    let dnsCalled = false
    const found = await discoverSubdomains('example.com', {
      includeWordlist: false,
      transports: {
        sslCheck: async () => sslInfo(),
        resolve4: () => {
          dnsCalled = true
          return Promise.resolve(['203.0.113.1'])
        },
        resolve6: rejects,
        resolveCname: rejects,
        fetchCt: async () => [],
      },
    })
    expect(dnsCalled).toBe(false)
    expect(found.size).toBe(0)
  })

  it('skips CT when includeCt is false', async () => {
    let ctCalled = false
    await discoverSubdomains('example.com', {
      includeCt: false,
      transports: {
        sslCheck: async () => sslInfo(),
        resolve4: rejects,
        resolve6: rejects,
        resolveCname: rejects,
        fetchCt: async () => {
          ctCalled = true
          return []
        },
      },
    })
    expect(ctCalled).toBe(false)
  })

  it('never throws when every source fails', async () => {
    await expect(
      discoverSubdomains('example.com', {
        transports: {
          sslCheck: async () => {
            throw new Error('tls timeout')
          },
          resolve4: rejects,
          resolve6: rejects,
          resolveCname: rejects,
          fetchCt: async () => {
            throw new Error('crt.sh down')
          },
        },
      }),
    ).resolves.toEqual(new Map())
  })
})

describe('rankAndCapCandidates', () => {
  it('ranks cert/dns candidates ahead of ct-only ones', () => {
    const found = new Map([
      ['ct-only.example.com', new Set<'cert' | 'dns' | 'ct'>(['ct'])],
      ['from-dns.example.com', new Set<'cert' | 'dns' | 'ct'>(['dns'])],
      ['from-cert.example.com', new Set<'cert' | 'dns' | 'ct'>(['cert'])],
    ])
    expect([...rankAndCapCandidates(found).keys()]).toEqual([
      'from-cert.example.com',
      'from-dns.example.com',
      'ct-only.example.com',
    ])
  })

  it('breaks ties alphabetically within the same rank', () => {
    const found = new Map([
      ['zebra.example.com', new Set<'cert' | 'dns' | 'ct'>(['dns'])],
      ['alpha.example.com', new Set<'cert' | 'dns' | 'ct'>(['dns'])],
    ])
    expect([...rankAndCapCandidates(found).keys()]).toEqual(['alpha.example.com', 'zebra.example.com'])
  })

  it('caps at maxHosts, keeping the highest-ranked entries', () => {
    const found = new Map([
      ['a.example.com', new Set<'cert' | 'dns' | 'ct'>(['ct'])],
      ['b.example.com', new Set<'cert' | 'dns' | 'ct'>(['cert'])],
      ['c.example.com', new Set<'cert' | 'dns' | 'ct'>(['dns'])],
    ])
    const capped = rankAndCapCandidates(found, 2)
    expect(capped.size).toBe(2)
    expect(capped.has('a.example.com')).toBe(false)
  })
})

describe('probeSubdomain', () => {
  it('reports not-resolving when no A/AAAA/CNAME answers', async () => {
    const result = await probeSubdomain('dead.example.com', {
      resolve4: rejects,
      resolve6: rejects,
      resolveCname: rejects,
    })
    expect(result.resolves).toBe(false)
    expect(result.addresses).toEqual([])
    expect(result.httpStatus).toBeNull()
  })

  it('follows a resolving host through an HTTP + cert probe without following redirects', async () => {
    const result = await probeSubdomain('api.example.com', {
      resolve4: () => Promise.resolve(['203.0.113.5']),
      resolve6: rejects,
      resolveCname: rejects,
      fetchFn: (async (_url: string, init?: RequestInit) => {
        expect(init?.redirect).toBe('manual')
        return new Response(null, { status: 301, headers: { Location: 'https://example.com/' } })
      }) as typeof fetch,
      sslCheck: async () => sslInfo({ daysRemaining: 12 }),
    })
    expect(result.resolves).toBe(true)
    expect(result.addresses).toEqual(['203.0.113.5'])
    expect(result.httpStatus).toBe(301)
    expect(result.sslDaysRemaining).toBe(12)
  })

  it('records the CNAME target when there is one, even with no A/AAAA', async () => {
    const result = await probeSubdomain('cdn.example.com', {
      resolve4: rejects,
      resolve6: rejects,
      resolveCname: () => Promise.resolve(['edge.example.net']),
      fetchFn: (async () => new Response(null, { status: 200 })) as typeof fetch,
      sslCheck: async () => sslInfo(),
    })
    expect(result.resolves).toBe(true)
    expect(result.cname).toBe('edge.example.net')
  })

  it('captures an HTTP error without failing the whole probe', async () => {
    const result = await probeSubdomain('flaky.example.com', {
      resolve4: () => Promise.resolve(['203.0.113.5']),
      resolve6: rejects,
      resolveCname: rejects,
      fetchFn: (async () => {
        throw new Error('connection reset')
      }) as typeof fetch,
      sslCheck: async () => null,
    })
    expect(result.resolves).toBe(true)
    expect(result.httpStatus).toBeNull()
    expect(result.error).toBe('connection reset')
  })
})
