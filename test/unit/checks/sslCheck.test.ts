import { describe, expect, it } from 'vitest'
import { parseAltNames } from '../../../server/utils/checks/sslCheck'

describe('parseAltNames', () => {
  it('returns an empty array for undefined input', () => {
    expect(parseAltNames(undefined)).toEqual([])
  })

  it('extracts DNS names, lowercased', () => {
    expect(parseAltNames('DNS:Example.com, DNS:api.Example.com')).toEqual(['example.com', 'api.example.com'])
  })

  it('drops wildcard entries', () => {
    expect(parseAltNames('DNS:example.com, DNS:*.example.com')).toEqual(['example.com'])
  })

  it('ignores non-DNS entries like IP addresses', () => {
    expect(parseAltNames('DNS:example.com, IP Address:1.2.3.4')).toEqual(['example.com'])
  })

  it('tolerates extra whitespace around entries', () => {
    expect(parseAltNames('DNS:example.com ,  DNS: api.example.com ')).toEqual(['example.com', 'api.example.com'])
  })
})
