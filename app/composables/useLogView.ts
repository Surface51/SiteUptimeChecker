import type { Ref } from 'vue'

export interface LogViewResult<T> {
  data: Ref<T>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
}

/**
 * Fetches one log analytics endpoint for the site in the current route, bound to the shared
 * range/environment filters. Client-only: these queries scan the DuckDB store and shouldn't
 * hold up the server-rendered shell, which has its own useful content to show first.
 *
 * The return type is declared rather than inferred — useFetch re-infers its data type from the
 * `default` factory, which loses T at the call site.
 */
export function useLogView<T>(path: string | (() => string), fallback: () => T): LogViewResult<T> {
  const route = useRoute()
  const filters = useInjectedLogFilters()
  const id = computed(() => Number(route.params.id))

  const result = useFetch(
    () => `/api/sites/${id.value}/logs/${typeof path === 'function' ? path() : path}`,
    {
      query: filters.query,
      default: fallback,
      server: false,
    },
  )

  return result as unknown as LogViewResult<T>
}
