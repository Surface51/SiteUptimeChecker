export interface NormalizedUrl {
  path: string
  hasQuery: boolean
  pathPattern: string
}

const NUMERIC_SEGMENT = /^\d+$/
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_SEGMENT = /^[0-9a-f]{16,}$/i

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** Splits a raw request-line URL into decoded path, query presence, and a low-cardinality pattern. */
export function normalizeUrl(rawUrl: string): NormalizedUrl {
  const queryIndex = rawUrl.indexOf('?')
  const hasQuery = queryIndex !== -1
  const rawPath = hasQuery ? rawUrl.slice(0, queryIndex) : rawUrl
  const path = safeDecode(rawPath) || '/'

  const pathPattern = path
    .split('/')
    .map((segment) => {
      if (segment === '') return ''
      if (NUMERIC_SEGMENT.test(segment)) return '{n}'
      if (UUID_SEGMENT.test(segment)) return '{uuid}'
      if (HEX_SEGMENT.test(segment)) return '{hex}'
      return segment
    })
    .join('/')

  return { path, hasQuery, pathPattern }
}
