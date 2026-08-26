<script setup lang="ts">
import type { CheckStatus } from '#shared/types'

/** `paused` and `maintenance` aren't check statuses — they're site states that
    render in the same slot, so they live here rather than as ad-hoc spans. */
type BadgeState = CheckStatus | 'unknown' | 'paused' | 'maintenance'

const props = withDefaults(
  defineProps<{ status: CheckStatus | null; state?: BadgeState; size?: 'sm' | 'md' }>(),
  { size: 'sm' },
)

const config: Record<BadgeState, { label: string; dot: string; text: string }> = {
  up: { label: 'Up', dot: 'bg-up', text: 'text-up' },
  degraded: { label: 'Degraded', dot: 'bg-degraded', text: 'text-degraded' },
  down: { label: 'Down', dot: 'bg-down', text: 'text-down' },
  unknown: { label: 'No data', dot: 'bg-neutral', text: 'text-tertiary' },
  paused: { label: 'Paused', dot: 'bg-neutral', text: 'text-tertiary' },
  maintenance: { label: 'Maintenance', dot: 'bg-maint', text: 'text-maint' },
}

const current = computed(() => config[props.state ?? props.status ?? 'unknown'])
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 font-medium"
    :class="[current.text, size === 'md' ? 'text-base' : 'text-sm']"
  >
    <span class="rounded-full" :class="[current.dot, size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2']" />
    {{ current.label }}
  </span>
</template>
