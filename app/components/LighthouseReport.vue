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
  if (!config.isScore) return 'text-primary'
  if (value >= 90) return 'text-up'
  if (value >= 50) return 'text-degraded'
  return 'text-down'
}

function delta(config: TileConfig): { text: string; color: string } | null {
  if (!latest.value || !previous.value) return null
  const cur = latest.value[config.key] as number | null
  const prev = previous.value[config.key] as number | null
  if (cur === null || prev === null) return null
  const diff = cur - prev
  if (Math.abs(diff) < (config.isScore ? 1 : 0.001)) return { text: '—', color: 'text-tertiary' }
  const improved = config.higherIsBetter ? diff > 0 : diff < 0
  const arrow = diff > 0 ? '▲' : '▼'
  const magnitude = config.isScore ? Math.abs(Math.round(diff)) : config.format(Math.abs(diff))
  return { text: `${arrow} ${magnitude}`, color: improved ? 'text-up' : 'text-down' }
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
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UiSegmentedControl
        :model-value="formFactor"
        :options="[
          { label: 'Mobile', value: 'mobile', icon: 'smartphone' },
          { label: 'Desktop', value: 'desktop', icon: 'desktop_windows' },
        ]"
        @update:model-value="emit('update:formFactor', $event as LighthouseFormFactor)"
      />
      <UiButton variant="secondary" :disabled="running" @click="runLighthouse">
        {{ running ? 'Running…' : 'Run reports' }}
      </UiButton>
    </div>

    <div v-if="latest" class="text-xs text-tertiary">Last run {{ formatTime(latest.measuredAt) }}</div>

    <div v-if="latest" class="grid grid-cols-2 gap-4 sm:grid-cols-5">
      <UiCard v-for="tile in TILES" :key="tile.key" padding="p-4">
        <div class="text-xs tracking-wide text-tertiary uppercase">{{ tile.label }}</div>
        <div class="mt-1.5 flex items-baseline gap-2">
          <span
            class="font-display text-2xl font-bold"
            :class="latest[tile.key] === null ? 'text-tertiary' : scoreColor(tile, latest[tile.key] as number)"
          >
            {{ latest[tile.key] === null ? '—' : tile.format(latest[tile.key] as number) }}
          </span>
          <span v-if="delta(tile)" class="text-xs font-semibold" :class="delta(tile)!.color">
            {{ delta(tile)!.text }}
          </span>
        </div>
      </UiCard>
    </div>

    <UiEmptyState v-else icon="speed">
      No Lighthouse report yet — click "Run reports" to audit this site.
    </UiEmptyState>
  </div>
</template>
