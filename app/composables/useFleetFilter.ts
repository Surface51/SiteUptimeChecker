import type { SiteSummary } from '#shared/types'

/** Tag filtering shared by the dashboard variations: sites must carry ALL the selected tags. */
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

  function toggleFilterTag(tag: string) {
    const idx = selectedTags.value.findIndex((t) => t.toLowerCase() === tag.toLowerCase())
    if (idx === -1) {
      selectedTags.value = [...selectedTags.value, tag]
    } else {
      selectedTags.value = selectedTags.value.filter((_, i) => i !== idx)
    }
  }

  const filteredSites = computed(() => {
    if (!selectedTags.value.length) return sites.value
    const wanted = selectedTags.value.map((t) => t.toLowerCase())
    return sites.value.filter((s) => {
      const have = new Set(s.tags.map((t) => t.toLowerCase()))
      return wanted.every((t) => have.has(t))
    })
  })

  return { allTags, selectedTags, toggleFilterTag, filteredSites }
}
