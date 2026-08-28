import type { Ref } from 'vue'
import type { LogFilters } from './useLogFilters'

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

  return useLogViewFor(id, filters, path, fallback)
}

/**
 * Same as {@link useLogView}, but for a site not addressed by the current route (and filters not
 * shared through the logs-shell injection) — e.g. embedding one site's log view inline elsewhere.
 */
export function useLogViewFor<T>(
  siteId: Ref<number> | number,
  filters: LogFilters,
  path: string | (() => string),
  fallback: () => T,
): LogViewResult<T> {
  const id = computed(() => (typeof siteId === 'number' ? siteId : siteId.value))
  return fetchLogView(() => `/api/sites/${id.value}/logs`, filters, path, fallback)
}

/**
 * Same shape again, but addressed by log-folder slug rather than a monitored site — the
 * `/api/logs/:slug/...` namespace, which resolves against the DuckDB store directly and works
 * for folders with no linked site at all.
 */
export function useLogViewForSlug<T>(
  slug: Ref<string> | string,
  filters: LogFilters,
  path: string | (() => string),
  fallback: () => T,
): LogViewResult<T> {
  const s = computed(() => (typeof slug === 'string' ? slug : slug.value))
  return fetchLogView(() => `/api/logs/${s.value}`, filters, path, fallback)
}

function fetchLogView<T>(
  base: () => string,
  filters: LogFilters,
  path: string | (() => string),
  fallback: () => T,
): LogViewResult<T> {
  const result = useFetch(
    () => `${base()}/${typeof path === 'function' ? path() : path}`,
    {
      query: filters.query,
      default: fallback,
      server: false,
    },
  )

  return result as unknown as LogViewResult<T>
}
