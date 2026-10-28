<script setup lang="ts">
export interface KpiDelta {
  text: string
  /** good/bad is already resolved by the caller — "down" is good for latency, bad for uptime. */
  tone: 'good' | 'bad' | 'flat'
  direction: 'up' | 'down' | 'flat'
}

defineProps<{ label: string; value: string; delta: KpiDelta | null }>()

const toneClass = { good: 'text-up', bad: 'text-down', flat: 'text-tertiary' } as const
const arrow = { up: '▲', down: '▼', flat: '–' } as const
</script>

<template>
  <div class="flex flex-col gap-2 font-body">
    <span class="font-display text-4xl leading-none font-bold tracking-tight text-primary">{{ value }}</span>
    <span class="text-sm text-secondary">{{ label }}</span>
    <span v-if="delta" class="-mt-1 text-xs font-medium" :class="toneClass[delta.tone]">
      {{ arrow[delta.direction] }} {{ delta.text }}
      <span class="font-normal text-tertiary">vs previous</span>
    </span>
    <span v-else class="-mt-1 text-xs text-tertiary">No comparison</span>
  </div>
</template>
