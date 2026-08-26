<script setup lang="ts">
type Tone = 'neutral' | 'outline' | 'accent' | 'up' | 'degraded' | 'down' | 'maint'

withDefaults(defineProps<{ tone?: Tone }>(), { tone: 'neutral' })

const toneClass: Record<Tone, string> = {
  neutral: 'bg-sunken text-primary border-border-default',
  outline: 'bg-transparent text-primary border-border-strong',
  accent: 'bg-accent text-accent-text border-accent',
  up: 'bg-up-tint text-up border-transparent',
  degraded: 'bg-degraded-tint text-degraded border-transparent',
  down: 'bg-down-tint text-down border-transparent',
  maint: 'bg-maint-tint text-maint border-transparent',
}
</script>

<template>
  <span
    class="inline-flex items-center rounded-full border px-3 py-[5px] font-body text-xs font-semibold tracking-wide uppercase"
    :class="toneClass[tone]"
  >
    <slot />
  </span>
</template>
