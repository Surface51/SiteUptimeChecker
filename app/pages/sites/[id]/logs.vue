<script setup lang="ts">
const route = useRoute()
const id = computed(() => Number(route.params.id))

const { site } = useInjectedSite()

const filters = useLogFilters()
// Shared with the child views through provide/inject so every tab reads one window without
// each page re-deriving it (and so the range control lives here, above <NuxtPage>).
provide(LOG_FILTERS_KEY, filters)

// Held back until the site is known to be linked: the endpoint answers 409 for an unlinked
// site, and asking anyway would put an error in the console on a page that is working fine.
const { data: envData, refresh: refreshEnvs } = await useFetch<{ envs: string[] }>(
  () => `/api/sites/${id.value}/logs/envs`,
  { default: () => ({ envs: [] }), server: false, immediate: false },
)

watch(
  () => site.value?.logSlug,
  (slug) => {
    if (slug) refreshEnvs()
  },
  { immediate: true },
)

const envOptions = computed(() => [
  { label: 'All environments', value: '' },
  ...(envData.value?.envs ?? []).map((env) => ({ label: env, value: env })),
])

const tabs = [
  { label: 'Traffic', to: '' },
  { label: 'Errors', to: 'errors' },
  { label: 'Performance', to: 'performance' },
  { label: 'PHP-FPM', to: 'php-fpm' },
  { label: 'MySQL', to: 'mysql' },
  { label: 'Bots', to: 'bots' },
  { label: 'Security', to: 'security' },
  { label: 'Timeline', to: 'timeline' },
  { label: 'Explorer', to: 'explorer' },
]

// New rows have landed — re-anchor the window and pick up any newly-seen environment.
function onIngestFinished() {
  filters.refresh()
  refreshEnvs()
}
</script>

<template>
  <div v-if="site" class="flex flex-col gap-6">
    <p v-if="site.logSlug" class="text-sm text-tertiary">
      Reading <code class="font-mono">log-ingress/{{ site.logSlug }}</code>
    </p>

    <UiEmptyState v-if="!site.logSlug" icon="folder_off">
      <p class="text-primary">This site isn't linked to a log folder yet.</p>
      <p>
        Drop logs at
        <code class="font-mono">log-ingress/&lt;name&gt;/&lt;env&gt;/&lt;server-ip&gt;/</code>, then
        pick that folder under Edit on the site page.
      </p>
    </UiEmptyState>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <UiTabNav :base="`/sites/${id}/logs`" :tabs="tabs" />

        <div class="flex flex-wrap items-center gap-2">
          <select
            v-if="envOptions.length > 2"
            :value="filters.env.value ?? ''"
            class="cursor-pointer rounded-full border border-border-default bg-raised px-3 py-1 text-xs text-primary outline-none transition-colors ease-snappy focus:border-border-strong"
            @change="filters.setEnv(($event.target as HTMLSelectElement).value || undefined)"
          >
            <option v-for="opt in envOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>

          <UiSegmentedControl
            :model-value="filters.range.value"
            :options="LOG_RANGE_PRESETS.map((p) => ({ label: p.label, value: p.value }))"
            @update:model-value="filters.setRange(String($event))"
          />
        </div>
      </div>

      <!-- Every panel below fetches client-side (the DuckDB scans shouldn't hold up the
           server-rendered shell), so there is nothing for the server to render but empty
           states — which then disagree with the client's loading state at hydration. -->
      <ClientOnly>
        <NuxtPage />
        <template #fallback>
          <UiCard>
            <p class="text-sm text-tertiary">Loading log data…</p>
          </UiCard>
        </template>
      </ClientOnly>

      <LogsIngestPanel @finished="onIngestFinished" />
    </template>
  </div>
</template>
