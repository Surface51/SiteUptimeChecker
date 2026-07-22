<script setup lang="ts">
import type { LighthouseFormFactor, LighthouseReport } from '#shared/types'

const props = defineProps<{
  siteId: number
  formFactor: LighthouseFormFactor
  history: LighthouseReport[]
}>()

const emit = defineEmits<{ 'update:formFactor': [LighthouseFormFactor]; ran: [] }>()

interface TileConfig {
  key: keyof LighthouseReport
  label: string
  isScore: boolean
  higherIsBetter: boolean
  format: (v: number) => string
}

const TILES: TileConfig[] = [
  { key: 'performance', label: 'Performance', isScore: true, higherIsBetter: true, format: (v) => `${Math.round(v)}` },
  { key: 'accessibility', label: 'Accessibility', isScore: true, higherIsBetter: true, format: (v) => `${Math.round(v)}` },
  { key: 'bestPractices', label: 'Best Practices', isScore: true, higherIsBetter: true, format: (v) => `${Math.round(v)}` },
  { key: 'seo', label: 'SEO', isScore: true, higherIsBetter: true, format: (v) => `${Math.round(v)}` },
  { key: 'fcp', label: 'FCP', isScore: false, higherIsBetter: false, format: (v) => `${(v / 1000).toFixed(2)}s` },
  { key: 'lcp', label: 'LCP', isScore: false, higherIsBetter: false, format: (v) => `${(v / 1000).toFixed(2)}s` },
  { key: 'tbt', label: 'TBT', isScore: false, higherIsBetter: false, format: (v) => `${Math.round(v)}ms` },
  { key: 'cls', label: 'CLS', isScore: false, higherIsBetter: false, format: (v) => v.toFixed(2) },
  { key: 'speedIndex', label: 'Speed Index', isScore: false, higherIsBetter: false, format: (v) => `${(v / 1000).toFixed(2)}s` },
  { key: 'tti', label: 'TTI', isScore: false, higherIsBetter: false, format: (v) => `${(v / 1000).toFixed(2)}s` },
]

const latest = computed(() => {
  for (let i = props.history.length - 1; i >= 0; i--) {
    if (!props.history[i]!.error) return props.history[i]!
  }
  return null
})

const previous = computed(() => {
  if (!latest.value) return null
  for (let i = props.history.length - 1; i >= 0; i--) {
    const point = props.history[i]!
    if (point.id !== latest.value.id && !point.error) return point
  }
  return null
})

function scoreColor(config: TileConfig, value: number): string {
  if (!config.isScore) return 'text-slate-100'
  if (value >= 90) return 'text-emerald-300'
  if (value >= 50) return 'text-amber-300'
  return 'text-rose-300'
}

function delta(config: TileConfig): { text: string; color: string } | null {
  if (!latest.value || !previous.value) return null
  const cur = latest.value[config.key] as number | null
  const prev = previous.value[config.key] as number | null
  if (cur === null || prev === null) return null
  const diff = cur - prev
  if (Math.abs(diff) < (config.isScore ? 1 : 0.001)) return { text: '—', color: 'text-slate-500' }
  const improved = config.higherIsBetter ? diff > 0 : diff < 0
  const arrow = diff > 0 ? '▲' : '▼'
  const magnitude = config.isScore ? Math.abs(Math.round(diff)) : config.format(Math.abs(diff))
  return { text: `${arrow} ${magnitude}`, color: improved ? 'text-emerald-400' : 'text-rose-400' }
}

const { ping: pingProgress } = useLighthouseProgress()

const running = ref(false)
async function runLighthouse() {
  running.value = true
  pingProgress()
  try {
    // Omitting formFactor runs BOTH mobile and desktop in one call (serialized server-side).
    await $fetch(`/api/sites/${props.siteId}/lighthouse`, { method: 'POST' })
    emit('ran')
  } finally {
    running.value = false
  }
}

function formatTime(iso: string) {
  return new Date(`${iso.replace(' ', 'T')}Z`).toLocaleString()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <div class="flex gap-1 rounded-md border border-slate-800 p-0.5 text-xs">
        <button
          type="button"
          class="rounded px-2 py-1"
          :class="formFactor === 'mobile' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
          @click="emit('update:formFactor', 'mobile')"
        >
          Mobile
        </button>
        <button
          type="button"
          class="rounded px-2 py-1"
          :class="formFactor === 'desktop' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
          @click="emit('update:formFactor', 'desktop')"
        >
          Desktop
        </button>
      </div>
      <button
        type="button"
        :disabled="running"
        class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        @click="runLighthouse"
      >
        {{ running ? 'Running…' : 'Run reports' }}
      </button>
    </div>

    <div v-if="latest" class="text-xs text-slate-500">
      Last run {{ formatTime(latest.measuredAt) }}
    </div>

    <div v-if="latest" class="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div v-for="tile in TILES" :key="tile.key" class="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <div class="text-xs text-slate-500">{{ tile.label }}</div>
        <div class="mt-1 flex items-baseline gap-2">
          <span
            class="text-xl font-semibold"
            :class="latest[tile.key] === null ? 'text-slate-600' : scoreColor(tile, latest[tile.key] as number)"
          >
            {{ latest[tile.key] === null ? '—' : tile.format(latest[tile.key] as number) }}
          </span>
          <span v-if="delta(tile)" class="text-xs font-medium" :class="delta(tile)!.color">
            {{ delta(tile)!.text }}
          </span>
        </div>
      </div>
    </div>

    <div v-else class="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
      No Lighthouse report yet — click "Run Lighthouse" to audit this site.
    </div>
  </div>
</template>
