<script setup lang="ts">
withDefaults(defineProps<{ as?: 'h2' | 'h3' }>(), { as: 'h2' })
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <component :is="as" class="font-display text-xl font-semibold tracking-tight text-primary">
      <slot />
    </component>
    <div v-if="$slots.actions" class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
