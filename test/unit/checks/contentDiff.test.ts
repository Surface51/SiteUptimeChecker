import { describe, expect, it } from 'vitest'
import {
  bodyHashOf,
  chunkHashes,
  compareChunks,
  normaliseBody,
} from '../../../server/utils/checks/contentDiff'

describe('normaliseBody', () => {
  it('strips HTML comments, collapses whitespace and lowercases', () => {
    expect(normaliseBody('  <!-- built 12:03 -->\n\n<H1>Hello   World</H1> ')).toBe('<h1>hello world</h1>')
  })

  it('makes a timestamp-only difference disappear', () => {
    const a = normaliseBody('<p>Home</p><!-- rendered 2026-08-29 10:00:00 -->')
    const b = normaliseBody('<p>Home</p><!-- rendered 2026-08-29 10:05:11 -->')
    expect(a).toBe(b)
  })
})

describe('bodyHashOf', () => {
  it('is stable for equivalent bodies and differs for changed ones', () => {
    expect(bodyHashOf('<p>a</p>')).toBe(bodyHashOf('  <p>a</p>  '))
    expect(bodyHashOf('<p>a</p>')).not.toBe(bodyHashOf('<p>b</p>'))
  })
})

describe('compareChunks', () => {
  it('reports 0 when identical', () => {
    const c = chunkHashes('x'.repeat(4096))
    expect(compareChunks(c, c)).toEqual({ ratio: 0, percent: 0 })
  })

  it('reports a partial ratio when some chunks change', () => {
    const ref = chunkHashes('a'.repeat(1024) + 'b'.repeat(1024) + 'c'.repeat(1024) + 'd'.repeat(1024))
    const cur = chunkHashes('a'.repeat(1024) + 'x'.repeat(1024) + 'c'.repeat(1024) + 'd'.repeat(1024))
    expect(compareChunks(ref, cur).percent).toBe(25)
  })

  it('counts a length change as differing chunks', () => {
    const ref = chunkHashes('a'.repeat(4096))
    const cur = chunkHashes('a'.repeat(2048))
    expect(compareChunks(ref, cur).percent).toBe(50)
  })

  it('is 0 for two empty inputs', () => {
    expect(compareChunks([], [])).toEqual({ ratio: 0, percent: 0 })
  })
})
