// A log slug names a directory directly under log-ingress/, so it is joined onto a filesystem
// path and interpolated into queries. Restricting it to a plain folder-name character set keeps
// both honest — in particular it rules out path traversal ("../etc") and absolute paths.
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function isValidLogSlug(value: string): boolean {
  return value.length <= 128 && value !== '.' && value !== '..' && SLUG_RE.test(value)
}

/** Trims a user-supplied slug, treating blank as "not linked". Returns undefined for input that
 * isn't a usable folder name, which callers surface as a 400. */
export function normalizeLogSlug(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  if (!trimmed) return null
  return isValidLogSlug(trimmed) ? trimmed : undefined
}
