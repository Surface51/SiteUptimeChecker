<script setup lang="ts">
defineProps<{ icon?: string }>()
</script>

<template>
  <div
    class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-default p-12 text-center text-sm text-tertiary"
  >
    <UiIcon v-if="icon" :name="icon" :size="32" />
    <slot />
  </div>
</template>
