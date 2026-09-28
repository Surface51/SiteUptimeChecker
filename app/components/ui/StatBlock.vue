<script setup lang="ts">
defineProps<{
  value: string | number
  label: string
  icon?: string
  /** Utility class for the value, e.g. `text-down` — defaults to primary text. */
  valueClass?: string
  /** Optional sub-line under the label, e.g. "p95 worst 2.4s". */
  hint?: string
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
    <span v-if="hint" class="-mt-1 text-xs text-tertiary">{{ hint }}</span>
  </div>
</template>
