<script setup lang="ts">
import type { DailyUptime } from '#shared/types'

const props = defineProps<{ days: DailyUptime[] }>()

function colorFor(day: DailyUptime): string {
  if (day.total === 0) return 'bg-slate-800/60'
  if (day.uptime === null) return 'bg-slate-800/60'
  if (day.uptime >= 99.9) return 'bg-emerald-500'
  if (day.uptime >= 99) return 'bg-emerald-600/70'
  if (day.uptime >= 95) return 'bg-amber-500'
  return 'bg-rose-500'
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function tooltip(day: DailyUptime) {
  if (day.total === 0) return `${formatDate(day.date)} — no data`
  return `${formatDate(day.date)} — ${day.uptime?.toFixed(1)}% uptime (${day.total} checks)`
}
</script>

<template>
  <div class="flex flex-wrap gap-1">
    <div
      v-for="day in days"
      :key="day.date"
      class="h-4 w-4 rounded-sm"
      :class="colorFor(day)"
      :title="tooltip(day)"
    />
  </div>
</template>
