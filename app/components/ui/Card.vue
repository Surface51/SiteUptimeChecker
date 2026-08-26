<script setup lang="ts">
withDefaults(
  defineProps<{
    padding?: string
    dashed?: boolean
    /** Drops the internal padding so tables/lists can bleed to the border. */
    flush?: boolean
  }>(),
  { padding: 'p-6' },
)
</script>

<template>
  <div
    class="rounded-lg bg-raised"
    :class="[
      dashed ? 'border border-dashed border-border-default' : 'border border-border-default',
      flush ? 'overflow-hidden' : padding,
    ]"
  >
    <slot />
  </div>
</template>
