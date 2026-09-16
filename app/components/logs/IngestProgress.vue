<script setup lang="ts">
import type { IngestStatus } from '#shared/types'

const props = defineProps<{ status: IngestStatus; progress: number }>()

function shortName(path: string) {
  return path.split('/').slice(-3).join('/')
}

interface ConsoleEntry {
  file: string
  ok: boolean
}

// Filled from currentFile transitions rather than per-checkpoint byte progress, so it grows
// one line per file instead of jittering as a single file's bytes-done ticks up.
const consoleLines = ref<ConsoleEntry[]>([])
const consoleEl = ref<HTMLElement | null>(null)

watch(
  () => props.status.startedAt,
  () => {
    consoleLines.value = []
  },
)

watch(
  () => props.status.currentFile,
  (next, prev) => {
    if (prev && prev !== next) {
      const failed = props.status.errors.some((err) => err.startsWith(`${prev}:`))
      consoleLines.value.push({ file: shortName(prev), ok: !failed })
      nextTick(() => {
        if (consoleEl.value) consoleEl.value.scrollTop = consoleEl.value.scrollHeight
      })
    }
  },
)

const currentFileName = computed(
  () => (props.status.currentFile ? shortName(props.status.currentFile) : null),
)

// Ticks once a second purely to keep the ETA live between SSE updates.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return `${minutes}m ${seconds}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

const etaLabel = computed(() => {
  const { startedAt, filesDone, filesTotal } = props.status
  if (!startedAt || filesDone === 0 || filesDone >= filesTotal) return null
  const elapsedMs = now.value - new Date(startedAt).getTime()
  const rate = filesDone / elapsedMs
  if (rate <= 0) return null
  const remainingMs = (filesTotal - filesDone) / rate
  return formatDuration(remainingMs)
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between text-sm text-secondary">
      <span>
        {{ status.filesDone }} of {{ status.filesTotal }} files
        <span v-if="status.source === 'cli'" class="text-tertiary">· external ingest</span>
        <span v-else-if="status.stopRequested" class="text-tertiary">· stopping…</span>
        <span v-else-if="etaLabel" class="text-tertiary">· ~{{ etaLabel }} left</span>
      </span>
      <span>{{ progress }}%</span>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-sunken">
      <div
        class="h-full rounded-full bg-accent transition-[width] duration-300 ease-snappy"
        :style="{ width: `${progress}%` }"
      />
    </div>
    <div
      ref="consoleEl"
      class="flex max-h-[6.75rem] flex-col overflow-y-auto rounded-md bg-sunken px-2 py-1.5 font-mono text-xs leading-5"
    >
      <p v-for="(entry, i) in consoleLines" :key="i" class="truncate text-tertiary">
        <span :class="entry.ok ? 'text-tertiary' : 'text-down'">{{ entry.ok ? '✓' : '✗' }}</span>
        {{ entry.file }}
      </p>
      <p v-if="currentFileName" class="truncate text-secondary">
        <span class="text-accent">▸</span> {{ currentFileName }}…
      </p>
    </div>
  </div>
</template>
