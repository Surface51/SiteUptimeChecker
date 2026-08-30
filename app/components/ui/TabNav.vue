<script setup lang="ts">
// Styled to match UiSegmentedControl, but built from NuxtLinks: each tab is its own route,
// so tabs have to be real links (bookmarkable, middle-clickable) rather than a bound value.
const props = withDefaults(
  defineProps<{
    /** Route prefix the tabs hang off, e.g. `/sites/3` or `/sites/3/logs`. No trailing slash. */
    base: string
    /** `to: ''` is the index tab (renders as `base` itself). */
    tabs: { label: string; to: string }[]
    /** Carry the current query string across tab switches — the logs sub-nav needs this to
     *  keep its range/env window; the site-level nav turns it off so a stale range doesn't
     *  follow the user out of the logs section. */
    preserveQuery?: boolean
  }>(),
  { preserveQuery: true },
)

const route = useRoute()

function path(to: string) {
  return to ? `${props.base}/${to}` : props.base
}

function href(to: string) {
  const target = path(to)
  return props.preserveQuery ? { path: target, query: route.query } : target
}

function isActive(to: string) {
  const target = path(to)
  if (!to) return route.path === props.base
  return route.path === target || route.path.startsWith(`${target}/`)
}
</script>

<template>
  <nav class="inline-flex flex-wrap gap-1 rounded-full border border-border-default p-1">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="href(tab.to)"
      class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium no-underline transition-colors duration-100 ease-snappy"
      :class="
        isActive(tab.to)
          ? 'bg-inverse text-on-inverse'
          : 'text-secondary hover:bg-sunken hover:text-primary'
      "
      :aria-current="isActive(tab.to) ? 'page' : undefined"
    >
      {{ tab.label }}
    </NuxtLink>
  </nav>
</template>
