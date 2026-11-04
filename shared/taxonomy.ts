/** The two site taxonomies. Hosting groups the dashboard; platform filters it. */
export const HOSTINGS = ['ACES', 'CPanel', 'Digital Ocean', 'Pantheon', 'Vercel'] as const
export const PLATFORMS = ['Drupal', 'Nuxt', 'Static', 'WordPress'] as const

export type Hosting = (typeof HOSTINGS)[number]
export type Platform = (typeof PLATFORMS)[number]

function matcher<T extends string>(values: readonly T[]) {
  return (name: unknown): T | null => {
    if (typeof name !== 'string') return null
    const key = name.trim().toLowerCase()
    return values.find((v) => v.toLowerCase() === key) ?? null
  }
}

/** Case-insensitive lookup returning the canonical value, or null if it isn't in the taxonomy. */
export const matchHosting = matcher(HOSTINGS)
export const matchPlatform = matcher(PLATFORMS)
