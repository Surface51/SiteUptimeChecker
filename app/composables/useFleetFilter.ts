import type { SiteSummary } from '#shared/types'
import { PLATFORMS, matchPlatform, type Platform } from '#shared/taxonomy'

/**
 * Filtering shared by the dashboard variations: sites must carry ALL the selected tags and match
 * ANY of the selected platforms (a site has only one platform).
 */
export function useFleetFilter(sites: Ref<SiteSummary[]>) {
  const route = useRoute()

  const allTags = computed(() => {
    const names = new Set<string>()
    for (const site of sites.value) {
      for (const tag of site.tags) names.add(tag)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  })

  const selectedTags = ref<string[]>(
    typeof route.query.tags === 'string' ? route.query.tags.split(',').filter(Boolean) : [],
  )

  const selectedPlatforms = ref<Platform[]>(
    typeof route.query.platforms === 'string'
      ? route.query.platforms.split(',').flatMap((p) => matchPlatform(p) ?? [])
      : [],
  )

  function togglePlatform(p: Platform) {
    selectedPlatforms.value = selectedPlatforms.value.includes(p)
      ? selectedPlatforms.value.filter((x) => x !== p)
      : [...selectedPlatforms.value, p]
  }

  /** Platforms in use, in taxonomy order, with how many sites carry each. */
  const platformOptions = computed(() =>
    PLATFORMS.map((platform) => ({ platform, count: sites.value.filter((s) => s.platform === platform).length })).filter(
      (o) => o.count > 0,
    ),
  )

  function toggleFilterTag(tag: string) {
    const idx = selectedTags.value.findIndex((t) => t.toLowerCase() === tag.toLowerCase())
    if (idx === -1) {
      selectedTags.value = [...selectedTags.value, tag]
    } else {
      selectedTags.value = selectedTags.value.filter((_, i) => i !== idx)
    }
  }

  const filteredSites = computed(() => {
    const platforms = selectedPlatforms.value
    const base = platforms.length ? sites.value.filter((s) => s.platform && platforms.includes(s.platform)) : sites.value
    if (!selectedTags.value.length) return base
    const wanted = selectedTags.value.map((t) => t.toLowerCase())
    return base.filter((s) => {
      const have = new Set(s.tags.map((t) => t.toLowerCase()))
      return wanted.every((t) => have.has(t))
    })
  })

  return { allTags, selectedTags, toggleFilterTag, selectedPlatforms, togglePlatform, platformOptions, filteredSites }
}
