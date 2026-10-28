<script setup lang="ts">
import type { SiteSummary } from '#shared/types'
import { siteHostname } from '~/utils/fleetStats'

const props = defineProps<{ site: SiteSummary; large?: boolean; pinnable?: boolean }>()
defineEmits<{ 'toggle-pin': [] }>()

type TileState = 'up' | 'degraded' | 'down' | 'paused' | 'maintenance' | 'unknown'

const state = computed<TileState>(() => {
  if (!props.site.enabled) return 'paused'
  if (props.site.inMaintenance) return 'maintenance'
  return props.site.latestCheck?.status ?? 'unknown'
})

// Full class strings so Tailwind can see them.
const tone: Record<TileState, { box: string; label: string }> = {
  up: { box: 'border-l-up bg-raised', label: 'text-up' },
  degraded: { box: 'border-l-degraded bg-degraded-tint', label: 'text-degraded' },
  down: { box: 'border-l-down bg-down-tint', label: 'text-down' },
  paused: { box: 'border-l-neutral bg-neutral-tint', label: 'text-tertiary' },
  maintenance: { box: 'border-l-maint bg-maint-tint', label: 'text-maint' },
  unknown: { box: 'border-l-neutral bg-raised', label: 'text-tertiary' },
}

const stateLabel: Record<TileState, string> = {
  up: 'Up',
  degraded: 'Degraded',
  down: 'Down',
  paused: 'Paused',
  maintenance: 'Maintenance',
  unknown: 'No data',
}

const tickColor = { up: 'bg-up', degraded: 'bg-degraded', down: 'bg-down' } as const

const ticks = computed(() => props.site.statusTicks.slice(-30))

const response = computed(() => {
  const t = props.site.latestCheck?.timeTotal
  return t == null ? '—' : `${Math.round(t)} ms`
})
</script>

<template>
  <!-- The pin button is a sibling of the link, not a child, so we never nest a button in an anchor. -->
  <div class="relative">
    <NuxtLink
      :to="`/sites/${site.id}`"
      class="flex h-full flex-col rounded-md border border-l-4 border-border-default no-underline transition-shadow hover:shadow-md"
      :class="[tone[state].box, large ? 'gap-3 p-4' : 'gap-2 p-3']"
    >
      <div class="flex items-start justify-between gap-2" :class="pinnable ? 'pr-6' : ''">
        <span class="min-w-0 truncate font-medium text-primary" :class="large ? 'text-lg' : 'text-sm'">
          {{ site.name || siteHostname(site) }}
        </span>
        <span v-if="site.openIncident" class="mt-1 h-2 w-2 shrink-0 rounded-full bg-down" title="Open incident" />
      </div>

      <div class="flex items-baseline justify-between gap-2">
        <span class="font-medium" :class="[tone[state].label, large ? 'text-base' : 'text-xs']">
          {{ stateLabel[state] }}
        </span>
        <span class="text-tertiary" :class="large ? 'text-base' : 'text-xs'">{{ response }}</span>
      </div>

      <div v-if="ticks.length" class="flex items-stretch gap-px" :class="large ? 'h-3' : 'h-2'" aria-hidden="true">
        <span
          v-for="(tick, i) in ticks"
          :key="i"
          class="min-w-0 flex-1 rounded-[1px]"
          :class="tickColor[tick.status]"
        />
      </div>
    </NuxtLink>

    <button
      v-if="pinnable"
      type="button"
      class="absolute top-1.5 right-1.5 cursor-pointer rounded-full border-none bg-transparent p-1 transition-colors hover:bg-sunken"
      :class="site.pinned ? 'text-accent' : 'text-tertiary'"
      :aria-label="site.pinned ? 'Unpin site' : 'Pin site'"
      :aria-pressed="site.pinned"
      @click="$emit('toggle-pin')"
    >
      <UiIcon :name="site.pinned ? 'star' : 'star_outline'" :size="16" />
    </button>
  </div>
</template>
