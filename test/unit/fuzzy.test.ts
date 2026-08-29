import { describe, expect, it } from 'vitest'
import { fuzzyMatch, fuzzyRank } from '../../app/utils/fuzzy'

describe('fuzzyMatch', () => {
  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyMatch('xyz', 'dashboard')).toBeNull()
    expect(fuzzyMatch('hsd', 'dashboard')).toBeNull() // no 's' after the 'h'
  })

  it('matches a subsequence and reports the matched indices', () => {
    const m = fuzzyMatch('dsh', 'dashboard')
    expect(m).not.toBeNull()
    expect(m!.indices).toEqual([0, 2, 3])
  })

  it('an empty query matches anything with no indices', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, indices: [] })
  })

  it('scores a contiguous prefix above a scattered match', () => {
    const contiguous = fuzzyMatch('das', 'dashboard')!
    const scattered = fuzzyMatch('das', 'due diligence assessment')!
    expect(contiguous.score).toBeGreaterThan(scattered.score)
  })

  it('rewards a word-start match', () => {
    const wordStart = fuzzyMatch('lt', 'logs timeline')! // l… t at word start
    const midWord = fuzzyMatch('lt', 'default')!
    expect(wordStart.score).toBeGreaterThan(midWord.score)
  })
})

describe('fuzzyRank', () => {
  it('keeps only matches and orders them best-first', () => {
    const items = ['Dashboard', 'Compare', 'Logs', 'Notifications', 'Add site']
    const ranked = fuzzyRank('as', items, (s) => s)
    expect(ranked.map((r) => r.item)).toContain('Add site')
    expect(ranked.map((r) => r.item)).toContain('Dashboard')
    expect(ranked.map((r) => r.item)).not.toContain('Logs')
    // "Add site" — 'a' and 's' both at word starts — should outrank "Dashboard".
    expect(ranked[0]!.item).toBe('Add site')
  })

  it('is stable for equal scores', () => {
    const items = ['aXbc', 'aYbc']
    const ranked = fuzzyRank('abc', items, (s) => s)
    expect(ranked.map((r) => r.item)).toEqual(['aXbc', 'aYbc'])
  })
})
