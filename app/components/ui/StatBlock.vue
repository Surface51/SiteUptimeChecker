<script setup lang="ts">
defineProps<{
  value: string | number
  label: string
  icon?: string
  /** Utility class for the value, e.g. `text-down` — defaults to primary text. */
  valueClass?: string
}>()
</script>

<template>
  <div class="flex flex-col gap-2 font-body">
    <UiIcon v-if="icon" :name="icon" :size="26" class="text-accent" />
    <span
      class="font-display text-4xl leading-none font-bold tracking-tight"
      :class="valueClass ?? 'text-primary'"
    >
      {{ value }}
    </span>
    <span class="text-sm text-secondary">{{ label }}</span>
  </div>
</template>
