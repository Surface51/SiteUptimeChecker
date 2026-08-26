<script setup lang="ts">
withDefaults(defineProps<{ active?: boolean; size?: 'sm' | 'md' }>(), { size: 'md' })
</script>

<template>
  <button
    type="button"
    class="cursor-pointer rounded-full border font-medium transition-colors duration-100 ease-snappy"
    :class="[
      size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm',
      active
        ? 'border-accent bg-accent text-accent-text'
        : 'border-border-default bg-transparent text-primary hover:bg-sunken',
    ]"
  >
    <slot />
  </button>
</template>
