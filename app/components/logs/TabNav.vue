<script setup lang="ts">
// Styled to match UiSegmentedControl, but built from NuxtLinks: each log view is its own route,
// so tabs have to be real links (bookmarkable, middle-clickable) rather than a bound value.
const props = defineProps<{
  siteId: number
  tabs: { label: string; to: string }[]
}>()

const route = useRoute()

function href(to: string) {
  const base = `/sites/${props.siteId}/logs`
  const path = to ? `${base}/${to}` : base
  // Carry the current range/env so switching view doesn't reset the window being looked at.
  return { path, query: route.query }
}

function isActive(to: string) {
  const path = to ? `/sites/${props.siteId}/logs/${to}` : `/sites/${props.siteId}/logs`
  return route.path === path
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
