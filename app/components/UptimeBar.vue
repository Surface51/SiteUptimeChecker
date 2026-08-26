<script setup lang="ts">
import type { CheckStatus } from '#shared/types'

defineProps<{ ticks: { checkedAt: string; status: CheckStatus }[] }>()

const colorClass: Record<CheckStatus, string> = {
  up: 'bg-up',
  degraded: 'bg-degraded',
  down: 'bg-down',
}

function formatTime(iso: string) {
  return new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString()
}
</script>

<template>
  <div v-if="ticks.length" class="flex h-6 items-stretch gap-0.5">
    <div
      v-for="(tick, i) in ticks"
      :key="i"
      class="min-w-[3px] flex-1 rounded-sm"
      :class="colorClass[tick.status]"
      :title="`${tick.status} — ${formatTime(tick.checkedAt)}`"
    />
  </div>
  <div v-else class="text-xs text-tertiary">No checks yet</div>
</template>
