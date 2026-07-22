<script setup lang="ts">
import type { IncidentRow } from '#shared/types'

const props = defineProps<{ incidents: IncidentRow[] }>()

function formatTime(iso: string) {
  return new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString()
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(2)}h`
}

const mttrSeconds = computed(() => {
  const closed = props.incidents.filter((i) => i.endedAt !== null)
  if (!closed.length) return null
  return closed.reduce((sum, i) => sum + (i.durationSeconds ?? 0), 0) / closed.length
})
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-medium text-slate-200">Incidents</h2>
      <div class="text-xs text-slate-500">
        {{ incidents.length }} total · MTTR {{ formatDuration(mttrSeconds === null ? null : Math.round(mttrSeconds)) }}
      </div>
    </div>

    <div v-if="!incidents.length" class="py-6 text-center text-sm text-slate-500">No incidents recorded.</div>

    <ul v-else class="flex flex-col divide-y divide-slate-800 text-sm">
      <li v-for="incident in incidents" :key="incident.id" class="flex items-center justify-between gap-3 py-2">
        <div class="min-w-0">
          <div class="text-slate-200">
            {{ formatTime(incident.startedAt) }}
            <span class="text-slate-500">→</span>
            {{ incident.endedAt ? formatTime(incident.endedAt) : 'ongoing' }}
          </div>
          <div v-if="incident.cause" class="truncate text-xs text-slate-500">{{ incident.cause }}</div>
        </div>
        <div
          class="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
          :class="incident.endedAt ? 'bg-slate-800 text-slate-300' : 'bg-rose-900/40 text-rose-300'"
        >
          {{ formatDuration(incident.durationSeconds) }}
        </div>
      </li>
    </ul>
  </div>
</template>
