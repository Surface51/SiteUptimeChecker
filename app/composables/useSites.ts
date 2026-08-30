import type { SiteSummary } from '#shared/types'

export function useSites() {
  const { data, error, pending, refresh } = useFetch<SiteSummary[]>('/api/sites', {
    default: () => [],
  })

  usePoll(() => refresh())

  async function addSite(input: { url: string; name?: string; checkIntervalSeconds?: number }) {
    await $fetch('/api/sites', { method: 'POST', body: input })
    await refresh()
  }

  async function removeSite(id: number) {
    await $fetch(`/api/sites/${id}`, { method: 'DELETE' })
    await refresh()
  }

  return { sites: data, error, pending, refresh, addSite, removeSite }
}
