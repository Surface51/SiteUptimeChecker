<script setup lang="ts">
import type { CheckStatus } from '#shared/types'

const props = defineProps<{ status: CheckStatus | null }>()

const config: Record<CheckStatus | 'unknown', { label: string; dot: string; text: string }> = {
  up: { label: 'Up', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  degraded: { label: 'Degraded', dot: 'bg-amber-400', text: 'text-amber-300' },
  down: { label: 'Down', dot: 'bg-rose-400', text: 'text-rose-300' },
  unknown: { label: 'No data', dot: 'bg-slate-500', text: 'text-slate-400' },
}

const current = computed(() => config[props.status ?? 'unknown'])
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-sm font-medium" :class="current.text">
    <span class="h-2 w-2 rounded-full" :class="current.dot" />
    {{ current.label }}
  </span>
</template>
