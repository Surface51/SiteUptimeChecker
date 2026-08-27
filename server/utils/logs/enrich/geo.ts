import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { resolveGeoipDataDir } from '../config'
import { BoundedCache } from '../boundedCache'

const cache = new BoundedCache<string, string | null>(20_000)

const COUNTRY_FILES = ['geoip-country.dat', 'geoip-country6.dat']

/** Mirrors just the two country-only .dat files (~6MB) out of geoip-lite's own data directory
 * — which also ships the ~105MB city database geoip-lite would otherwise load by default —
 * into a dedicated directory. Idempotent; only copies files that aren't already there. */
function ensureCountryOnlyDataDir(): string {
  const dir = resolveGeoipDataDir()
  const sourceDir = join(dirname(createRequire(import.meta.url).resolve('geoip-lite/package.json')), 'data')

  mkdirSync(dir, { recursive: true })
  for (const file of COUNTRY_FILES) {
    const dest = join(dir, file)
    if (!existsSync(dest)) copyFileSync(join(sourceDir, file), dest)
  }
  return dir
}

// geoip-lite reads its data directory (and preloads its .dat files into memory) at module
// load time, so the require is deferred until first use — and GEODATADIR is pointed at a
// country-only mirror first, to avoid loading the ~105MB city database of which only the
// country code is ever used below. GEOIP_COUNTRY_DIR overrides the mirror if set.
//
// Nitro's tracer can't follow this dynamic require, so nuxt.config.ts copies the whole
// geoip-lite package into the server output (same treatment as lighthouse).
let geoip: typeof import('geoip-lite') | null = null
function getGeoip(): typeof import('geoip-lite') {
  if (geoip) return geoip

  try {
    process.env.GEODATADIR = process.env.GEOIP_COUNTRY_DIR || ensureCountryOnlyDataDir()
  } catch {
    // Mirroring failed (e.g. read-only filesystem) — fall back to geoip-lite's own default
    // data dir, which includes city data.
  }
  geoip = createRequire(import.meta.url)('geoip-lite') as typeof import('geoip-lite')
  return geoip
}

export function lookupCountry(ip: string): string | null {
  const existing = cache.get(ip)
  if (existing !== undefined) return existing

  let country: string | null = null
  try {
    const result = getGeoip().lookup(ip)
    country = result?.country || null
  } catch {
    country = null
  }

  cache.set(ip, country)
  return country
}

/** Called after an ingest run: this cache only earns its keep during ingestion. */
export function clearGeoCache(): void {
  cache.clear()
}
