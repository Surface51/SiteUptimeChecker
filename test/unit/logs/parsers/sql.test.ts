import { describe, it, expect } from 'vitest'
import { normalizeSql, hashSql } from '../../../../server/utils/logs/fingerprint/sql'

describe('normalizeSql', () => {
  it('strips string and numeric literals', () => {
    const sql = `SELECT * FROM t WHERE id = 42 AND name = 'bob'`
    expect(normalizeSql(sql)).toBe('select * from t where id = ? and name = ?')
  })

  it('leaves double-quoted identifiers alone', () => {
    const sql = `SELECT "t"."item_id" FROM "search_api_db_bibliography" "t"`
    expect(normalizeSql(sql)).toBe('select "t"."item_id" from "search_api_db_bibliography" "t"')
  })

  it('does not touch digits embedded in identifiers', () => {
    const sql = `SELECT "t"."field_genres_2" FROM t`
    expect(normalizeSql(sql)).toContain('field_genres_2')
  })

  it('collapses an IN list into a single placeholder marker', () => {
    const sql = `SELECT * FROM t WHERE id IN (1, 2, 3, 4)`
    expect(normalizeSql(sql)).toBe('select * from t where id in (?+)')
  })

  it('collapses repeated identical OR blocks (the Drupal facet pattern)', () => {
    // Realistic shape: "WHERE (block1) OR (block2) OR (block3)" — the leading "WHERE ("
    // keeps the first occurrence textually distinct from the bare repeats that follow, so a
    // 3-block run collapses to one distinct chunk + a 2x-repeat marker, not a single 3x marker.
    const block = `("t"."word" IN ('71')) AND ("t"."field_name" IN ('field_genres'))`
    const block2 = block.replace('71', '106')
    const block3 = block.replace('71', '108')
    const sql = `SELECT 1 WHERE ${block} OR ${block2} OR ${block3}`
    const normalized = normalizeSql(sql)
    expect(normalized).toContain('/*x2*/')
    // three un-collapsed literal-bearing blocks would each mention field_genres; after
    // collapsing, only two textual copies of the block body remain (first + collapsed run)
    const occurrences = normalized.split('"field_name"').length - 1
    expect(occurrences).toBe(2)
  })

  it('gives two facet queries differing only in facet count distinguishable fingerprints', () => {
    const makeQuery = (n: number) => {
      const blocks = Array.from({ length: n }, (_, i) => `("t"."word" IN ('${i}')) AND ("t"."field_name" IN ('field_genres'))`)
      return `SELECT 1 WHERE ${blocks.join(' OR ')}`
    }
    const few = hashSql(normalizeSql(makeQuery(3)))
    const many = hashSql(normalizeSql(makeQuery(40)))
    expect(few).not.toBe(many)
  })

  it('produces the same fingerprint hash for structurally identical queries with different literals', () => {
    const a = normalizeSql(`SELECT * FROM t WHERE id = 1`)
    const b = normalizeSql(`SELECT * FROM t WHERE id = 999999`)
    expect(hashSql(a)).toBe(hashSql(b))
  })

  it('produces different fingerprints for structurally different queries', () => {
    const a = normalizeSql(`SELECT * FROM t WHERE id = 1`)
    const b = normalizeSql(`SELECT * FROM t WHERE name = 'x'`)
    expect(hashSql(a)).not.toBe(hashSql(b))
  })
})
