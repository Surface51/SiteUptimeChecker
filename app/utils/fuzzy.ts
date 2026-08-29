/**
 * Tiny subsequence fuzzy matcher for the command palette. Returns null when `query` is not a
 * subsequence of `text`; otherwise a score (higher is better) plus the matched character indices
 * so the caller can bold them.
 *
 * Scoring rewards contiguous runs and matches at word starts, and lightly penalises leading gap —
 * enough to rank "Dashboard" above "Add site" for the query "das".
 */
export interface FuzzyMatch {
  score: number
  indices: number[]
}

export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase()
  if (!q) return { score: 0, indices: [] }
  const t = text.toLowerCase()

  const indices: number[] = []
  let qi = 0
  let score = 0
  let run = 0
  let prevIdx = -1

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) {
      run = 0
      continue
    }
    indices.push(ti)

    let bonus = 1
    if (prevIdx === ti - 1) {
      run += 1
      bonus += run * 4 // contiguous run
    } else {
      run = 0
    }
    if (ti === 0) bonus += 10
    else if (/[\s\-_/.]/.test(t[ti - 1]!)) bonus += 8 // word start
    if (prevIdx === -1) bonus -= ti * 0.2 // small leading-gap penalty

    score += bonus
    prevIdx = ti
    qi += 1
  }

  if (qi < q.length) return null
  // Prefer shorter haystacks when scores otherwise tie.
  score -= t.length * 0.05
  return { score, indices }
}

/** Filter + rank a list by a key function, dropping non-matches. Stable for equal scores. */
export function fuzzyRank<T>(query: string, items: T[], key: (item: T) => string): { item: T; match: FuzzyMatch }[] {
  const out: { item: T; match: FuzzyMatch; order: number }[] = []
  items.forEach((item, order) => {
    const match = fuzzyMatch(query, key(item))
    if (match) out.push({ item, match, order })
  })
  out.sort((a, b) => b.match.score - a.match.score || a.order - b.order)
  return out.map(({ item, match }) => ({ item, match }))
}
