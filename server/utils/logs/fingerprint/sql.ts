import { createHash } from 'node:crypto'

/** Collapses consecutive identical " or " segments into one + a repeat-count marker.
 * Drupal's search_api facet queries generate dozens of near-identical `OR (...)` blocks
 * that differ only in a literal value — after normalizeSql() replaces those literals with
 * `?`, the blocks become byte-identical and collapse here, so 40 facets digest the same
 * as 2. */
function collapseRepeatedOr(sql: string): string {
  const parts = sql.split(/ or /gi)
  if (parts.length <= 1) return sql

  const collapsed: string[] = []
  let i = 0
  while (i < parts.length) {
    let j = i + 1
    while (j < parts.length && parts[j] === parts[i]) j++
    const runLength = j - i
    collapsed.push(runLength > 1 ? `${parts[i]}/*x${runLength}*/` : parts[i]!)
    i = j
  }
  return collapsed.join(' or ')
}

/** Normalizes a SQL statement into a low-cardinality fingerprint pattern, pt-query-digest style:
 * literals stripped, IN-lists and VALUES-lists collapsed, repeated OR-blocks collapsed. */
export function normalizeSql(rawSql: string): string {
  let sql = rawSql

  sql = sql.replace(/--[^\n]*$/gm, '')
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, '')
  sql = sql.replace(/\s+/g, ' ').trim()

  // String literals -> ? (double-quoted identifiers, e.g. "t"."item_id", are left alone).
  sql = sql.replace(/'(?:[^'\\]|\\.)*'/g, '?')
  // Bare numeric literals -> ? (word-boundary guarded so digits embedded in identifiers,
  // e.g. field_genres_2, are untouched).
  sql = sql.replace(/\b\d+(\.\d+)?\b/g, '?')

  sql = sql.toLowerCase()

  sql = sql.replace(/\bin\s*\(\s*(?:\?\s*,\s*)*\?\s*\)/g, 'in (?+)')
  sql = sql.replace(/\bvalues\s*(?:\(\s*\?(?:\s*,\s*\?)*\s*\)\s*,?\s*)+/g, 'values (?+) ')

  sql = collapseRepeatedOr(sql)

  return sql.trim()
}

export function hashSql(normalized: string): string {
  return createHash('md5').update(normalized).digest('hex')
}
