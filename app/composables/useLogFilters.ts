import type { InjectionKey } from 'vue'

export interface LogRangePreset {
  label: string
  value: string
  hours: number
}

export const LOG_RANGE_PRESETS: LogRangePreset[] = [
  { label: '24 hours', value: '24h', hours: 24 },
  { label: '7 days', value: '7d', hours: 24 * 7 },
  { label: '30 days', value: '30d', hours: 24 * 30 },
  { label: '90 days', value: '90d', hours: 24 * 90 },
]

const DEFAULT_RANGE = '7d'

/**
 * Range and environment for the log views, held in the URL query so a view someone is looking
 * at can be linked to. The range is stored as a preset name rather than absolute timestamps —
 * a shared "last 7 days" link should mean 7 days from when it's opened, not a frozen window.
 */
export function useLogFilters() {
  const route = useRoute()
  const router = useRouter()

  const range = computed(() => {
    const value = String(route.query.range ?? DEFAULT_RANGE)
    return LOG_RANGE_PRESETS.some((p) => p.value === value) ? value : DEFAULT_RANGE
  })

  const env = computed(() => (route.query.env ? String(route.query.env) : undefined))

  // The window is anchored to a fixed instant rather than Date.now(): a `to` that moved on
  // every render would change the fetch key continuously and refetch forever.
  const anchor = ref(Date.now())
  watch(range, () => {
    anchor.value = Date.now()
  })

  const hours = computed(
    () => LOG_RANGE_PRESETS.find((p) => p.value === range.value)?.hours ?? 24 * 7,
  )
  const from = computed(() => new Date(anchor.value - hours.value * 3_600_000).toISOString())
  const to = computed(() => new Date(anchor.value).toISOString())

  /** Query for useFetch. Include it in the URL builder so views refetch when filters change. */
  const query = computed(() => ({
    from: from.value,
    to: to.value,
    ...(env.value ? { env: env.value } : {}),
  }))

  function setRange(value: string) {
    router.replace({ query: { ...route.query, range: value } })
  }

  function setEnv(value: string | undefined) {
    const next = { ...route.query }
    if (value) next.env = value
    else delete next.env
    router.replace({ query: next })
  }

  /** Re-anchor the window to now, e.g. after an ingest run brings in fresher rows. */
  function refresh() {
    anchor.value = Date.now()
  }

  return { range, env, from, to, hours, query, setRange, setEnv, refresh }
}

export type LogFilters = ReturnType<typeof useLogFilters>

/** The logs shell owns one instance and provides it; every tab reads that same window. */
export const LOG_FILTERS_KEY: InjectionKey<LogFilters> = Symbol('logFilters')

export function useInjectedLogFilters(): LogFilters {
  const filters = inject(LOG_FILTERS_KEY)
  if (!filters) throw new Error('useInjectedLogFilters() must be used inside the logs shell page')
  return filters
}
