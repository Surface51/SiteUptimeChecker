<script setup lang="ts">
import type { SiteSummary } from '#shared/types'

const props = defineProps<{ sites: SiteSummary[] }>()

const upCount = computed(() => props.sites.filter((s) => s.enabled && s.latestCheck?.status === 'up').length)
const degradedCount = computed(() => props.sites.filter((s) => s.enabled && s.latestCheck?.status === 'degraded').length)
const downCount = computed(() => props.sites.filter((s) => s.enabled && s.latestCheck?.status === 'down').length)
const pausedCount = computed(() => props.sites.filter((s) => !s.enabled).length)

const overallUptime = computed(() => {
  const values = props.sites.map((s) => s.uptime24h).filter((v): v is number => v !== null)
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
})
</script>

<template>
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
    <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div class="text-xs text-slate-500">Sites</div>
      <div class="mt-1 text-xl font-semibold text-slate-100">{{ sites.length }}</div>
    </div>
    <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div class="text-xs text-slate-500">Up</div>
      <div class="mt-1 text-xl font-semibold text-emerald-300">{{ upCount }}</div>
    </div>
    <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div class="text-xs text-slate-500">Degraded</div>
      <div class="mt-1 text-xl font-semibold text-amber-300">{{ degradedCount }}</div>
    </div>
    <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div class="text-xs text-slate-500">Down</div>
      <div class="mt-1 text-xl font-semibold text-rose-300">{{ downCount }}</div>
    </div>
    <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div class="text-xs text-slate-500">Avg uptime (24h)</div>
      <div class="mt-1 text-xl font-semibold text-slate-100">
        {{ overallUptime === null ? '—' : `${overallUptime.toFixed(2)}%` }}
      </div>
    </div>
    <div v-if="pausedCount" class="col-span-2 text-xs text-slate-500 sm:col-span-5">{{ pausedCount }} paused</div>
  </div>
</template>
