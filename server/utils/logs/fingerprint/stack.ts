import { createHash } from 'node:crypto'

export function hashFingerprint(parts: Array<string | number | null | undefined>): string {
  const joined = parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('|')
  return createHash('md5').update(joined).digest('hex')
}
