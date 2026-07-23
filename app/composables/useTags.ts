/** Global list of tag names in use, shared across every component instance for autocomplete. */
export function useTags() {
  const tags = useState<string[]>('allTagNames', () => [])

  async function refresh() {
    tags.value = await $fetch<string[]>('/api/tags')
  }

  if (import.meta.client && tags.value.length === 0) {
    refresh()
  }

  return { tags, refresh }
}
