import { createHash } from 'node:crypto'

/**
 * Content-change detection for the defacement watch. A whole-body hash is useless on a real site
 * (a CMS changes bytes every request), so instead the normalised body is cut into fixed chunks,
 * each hashed, and the change ratio is the fraction of chunks that differ from a stored
 * reference. Only a ratio above the site's sensitivity raises an alert.
 *
 * Pure — the caller owns reading and writing the stored reference.
 */

const CHUNK_BYTES = 1024
const HASH_PREFIX = 8

/** Lowercase, drop HTML comments, collapse whitespace runs — removes the churn that isn't content. */
export function normaliseBody(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Short hex digest of the whole normalised body — stored per check so the log can show it changed. */
export function bodyHashOf(body: string): string {
  return createHash('sha256').update(normaliseBody(body)).digest('hex').slice(0, 16)
}

/** Per-chunk hash list of the normalised body — the content-watch reference. */
export function chunkHashes(body: string): string[] {
  const norm = normaliseBody(body)
  const out: string[] = []
  for (let i = 0; i < norm.length; i += CHUNK_BYTES) {
    out.push(
      createHash('sha256').update(norm.slice(i, i + CHUNK_BYTES)).digest('hex').slice(0, HASH_PREFIX),
    )
  }
  return out
}

export interface ContentChange {
  /** 0..1 — share of chunks that differ, length change included. */
  ratio: number
  /** ratio as a rounded percentage, for messages. */
  percent: number
}

/** Compare a fresh chunk list against the reference. */
export function compareChunks(reference: string[], current: string[]): ContentChange {
  const max = Math.max(reference.length, current.length)
  if (max === 0) return { ratio: 0, percent: 0 }
  let differing = 0
  for (let i = 0; i < max; i++) {
    if (reference[i] !== current[i]) differing++
  }
  const ratio = differing / max
  return { ratio, percent: Math.round(ratio * 100) }
}
