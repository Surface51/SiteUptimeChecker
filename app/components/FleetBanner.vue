<script setup lang="ts">
import type { SiteSummary } from '#shared/types'
import { formatPct, meanUptime24h, openIncidentsCount, statusCounts } from '~/utils/fleetStats'

const props = defineProps<{ sites: SiteSummary[]; kiosk: boolean; secondsAgo: number; showCounts?: boolean }>()
defineEmits<{ 'toggle-kiosk': [] }>()

const counts = computed(() => statusCounts(props.sites))
const uptime = computed(() => meanUptime24h(props.sites))
const incidents = computed(() => openIncidentsCount(props.sites))

const banner = computed(() => {
  if (counts.value.down === 0 && counts.value.degraded === 0) {
    return { text: 'All systems operational', box: 'border-up bg-up-tint', icon: 'check_circle', ink: 'text-up' }
  }
  const parts = []
  if (counts.value.down) parts.push(`${counts.value.down} down`)
  if (counts.value.degraded) parts.push(`${counts.value.degraded} degraded`)
  return {
    text: parts.join(' · '),
    box: counts.value.down ? 'border-down bg-down-tint' : 'border-degraded bg-degraded-tint',
    icon: counts.value.down ? 'error' : 'warning',
    ink: counts.value.down ? 'text-down' : 'text-degraded',
  }
})
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-6 rounded-lg border-2"
    :class="[banner.box, kiosk ? 'px-10 py-8' : 'px-7 py-6']"
  >
    <div class="flex items-center gap-4">
      <UiIcon :name="banner.icon" :size="kiosk ? 56 : 40" :class="banner.ink" />
      <div class="flex flex-col gap-2">
        <h1 class="font-display font-bold tracking-tight" :class="[banner.ink, kiosk ? 'text-6xl' : 'text-4xl']">
          {{ banner.text }}
        </h1>
        <p
          v-if="showCounts"
          class="flex flex-wrap items-center gap-x-5 gap-y-1 font-medium"
          :class="kiosk ? 'text-xl' : 'text-sm'"
        >
          <span class="inline-flex items-center gap-1.5" :class="counts.up ? 'text-up' : 'text-tertiary'">
            <span class="h-2 w-2 rounded-full" :class="counts.up ? 'bg-up' : 'bg-neutral'" />{{ counts.up }} up
          </span>
          <span class="inline-flex items-center gap-1.5" :class="counts.degraded ? 'text-degraded' : 'text-tertiary'">
            <span class="h-2 w-2 rounded-full" :class="counts.degraded ? 'bg-degraded' : 'bg-neutral'" />{{
              counts.degraded
            }}
            degraded
          </span>
          <span class="inline-flex items-center gap-1.5" :class="counts.down ? 'text-down' : 'text-tertiary'">
            <span class="h-2 w-2 rounded-full" :class="counts.down ? 'bg-down' : 'bg-neutral'" />{{ counts.down }} down
          </span>
          <span v-if="counts.paused" class="text-tertiary">{{ counts.paused }} paused</span>
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-x-10 gap-y-4">
      <div class="flex flex-col">
        <span class="font-display font-bold text-primary" :class="kiosk ? 'text-5xl' : 'text-3xl'">
          {{ formatPct(uptime) }}
        </span>
        <span class="text-sm text-secondary">Avg uptime (24h)</span>
      </div>
      <div class="flex flex-col">
        <span
          class="font-display font-bold"
          :class="[incidents ? 'text-down' : 'text-primary', kiosk ? 'text-5xl' : 'text-3xl']"
        >
          {{ incidents }}
        </span>
        <span class="text-sm text-secondary">Open incidents</span>
      </div>
      <div class="flex flex-col items-end gap-2">
        <UiButton variant="secondary" :icon="kiosk ? 'close_fullscreen' : 'tv'" @click="$emit('toggle-kiosk')">
          {{ kiosk ? 'Exit kiosk' : 'Kiosk mode' }}
        </UiButton>
        <span v-if="kiosk" class="text-xs text-secondary">Updated {{ secondsAgo }}s ago · Esc to exit</span>
      </div>
    </div>
  </div>
</template>
