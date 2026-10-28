import type { SiteSummary } from '#shared/types'
import { fuzzyMatch } from '~/utils/fuzzy'
import { statusRank } from '~/utils/fleetStats'

export type DirectorySortKey = 'status' | 'name' | 'uptime24h' | 'response'
export type DirectoryLayout = 'tag' | 'flat'

const COLLAPSED_KEY = 'siteUptime.directoryCollapsed'
const UNTAGGED = 'Untagged'

/**
 * Search, sort, tag-grouping, collapse state and pinning for the directory-style dashboards.
 * `filtered` is the tag-filtered site list (from useFleetFilter); everything else builds on it.
 */
export function useDirectory(filtered: Ref<SiteSummary[]>, refresh: () => unknown) {
  const { push: pushToast } = useToasts()

  const query = ref('')
  const layout = ref<DirectoryLayout>('tag')
  const sortKey = ref<DirectorySortKey>('status')
  const sortOptions: { label: string; value: DirectorySortKey }[] = [
    { label: 'Status', value: 'status' },
    { label: 'Name', value: 'name' },
    { label: 'Uptime', value: 'uptime24h' },
    { label: 'Response', value: 'response' },
  ]

  const displayName = (s: SiteSummary) => s.name || s.url

  const visibleSites = computed(() => {
    const q = query.value.trim()
    if (!q) return filtered.value
    return filtered.value.filter((s) => fuzzyMatch(q, `${displayName(s)} ${s.url}`) !== null)
  })

  function compare(a: SiteSummary, b: SiteSummary): number {
    // Pinned always float to the top of whatever order is chosen.
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    switch (sortKey.value) {
      case 'name':
        return displayName(a).localeCompare(displayName(b))
      case 'uptime24h':
        return (b.uptime24h ?? -1) - (a.uptime24h ?? -1)
      case 'response':
        return (a.latestCheck?.timeTotal ?? Infinity) - (b.latestCheck?.timeTotal ?? Infinity)
      default:
        return statusRank(a.latestCheck?.status) - statusRank(b.latestCheck?.status)
    }
  }

  const sortedSites = computed(() => [...visibleSites.value].sort(compare))
  const pinnedSites = computed(() => sortedSites.value.filter((s) => s.pinned))

  // A site with several tags appears under each of them. Groups with a down site come first.
  const groups = computed(() => {
    if (layout.value === 'flat') return [{ key: 'all', title: 'All sites', sites: sortedSites.value }]

    const byTag = new Map<string, SiteSummary[]>()
    for (const site of sortedSites.value) {
      for (const tag of site.tags.length ? site.tags : [UNTAGGED]) {
        byTag.set(tag, [...(byTag.get(tag) ?? []), site])
      }
    }
    const downIn = (list: SiteSummary[]) => list.filter((s) => s.enabled && s.latestCheck?.status === 'down').length
    return [...byTag.entries()]
      .sort(([ta, la], [tb, lb]) => {
        if ((ta === UNTAGGED) !== (tb === UNTAGGED)) return ta === UNTAGGED ? 1 : -1
        return downIn(lb) - downIn(la) || ta.localeCompare(tb)
      })
      .map(([tag, list]) => ({ key: `tag:${tag}`, title: tag, sites: list }))
  })

  // Collapse state is remembered per browser.
  const collapsed = ref<string[]>([])

  onMounted(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')
      if (Array.isArray(saved)) collapsed.value = saved.filter((k): k is string => typeof k === 'string')
    } catch {
      // Storage unavailable or corrupt — start expanded.
    }
  })

  function toggleCollapsed(key: string) {
    collapsed.value = collapsed.value.includes(key)
      ? collapsed.value.filter((k) => k !== key)
      : [...collapsed.value, key]
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed.value))
    } catch {
      // Not persisted; still works for this session.
    }
  }

  async function togglePin(site: SiteSummary) {
    try {
      await $fetch(`/api/sites/${site.id}`, { method: 'PATCH', body: { pinned: !site.pinned } })
      await refresh()
    } catch {
      pushToast('Could not update pin', 'warning')
    }
  }

  return {
    query,
    layout,
    sortKey,
    sortOptions,
    visibleSites,
    pinnedSites,
    groups,
    collapsed,
    toggleCollapsed,
    togglePin,
  }
}
