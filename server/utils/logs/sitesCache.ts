const CACHE_TTL_MS = 60_000
let cached: { at: number; body: unknown } | null = null

export function getCachedSites(): unknown | null {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.body
  return null
}

export function setCachedSites(body: unknown): void {
  cached = { at: Date.now(), body }
}

/** Called at the end of an ingest run so the next request reflects new data immediately
 * instead of waiting out the TTL. */
export function invalidateSitesCache(): void {
  cached = null
}
