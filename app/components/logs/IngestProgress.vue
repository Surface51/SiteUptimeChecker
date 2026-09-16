<script setup lang="ts">
import type { IngestStatus } from '#shared/types'

const props = defineProps<{ status: IngestStatus; progress: number }>()

function shortName(path: string) {
  return path.split('/').slice(-3).join('/')
}

type ConsoleEntry =
  | { kind: 'file'; file: string; ok: boolean }
  | { kind: 'skipped'; count: number }

// Bounds DOM/render cost to a fixed small size no matter how long a run is — a run can touch
// thousands of files, and an unbounded v-for over all of them is its own perf problem.
const MAX_CONSOLE_LINES = 8

const consoleLines = ref<ConsoleEntry[]>([])
const consoleEl = ref<HTMLElement | null>(null)

// Unchanged files can fly by faster than one SSE message per file is worth reacting to
// individually (a re-run can skip thousands in seconds) — tally them and emit one rolling
// "N unchanged" line instead of pushing a row per file.
let pendingSkipped = 0
let lastFilesSkipped = 0
// Synced from pendingSkipped at most once per animation frame, so the live "N unchanged…"
// preview updates smoothly without a DOM write per SSE message.
const visiblePendingSkipped = ref(0)

let scrollFrame: number | null = null

function pushEntry(entry: ConsoleEntry) {
  consoleLines.value.push(entry)
  if (consoleLines.value.length > MAX_CONSOLE_LINES) {
    consoleLines.value.splice(0, consoleLines.value.length - MAX_CONSOLE_LINES)
  }
}

function flushSkipped() {
  if (pendingSkipped > 0) {
    pushEntry({ kind: 'skipped', count: pendingSkipped })
    pendingSkipped = 0
  }
}

// Coalesces however many watcher callbacks fired since the last paint into a single DOM
// write, so a burst of SSE messages costs at most one reflow per frame, not one per message.
function scheduleFrame() {
  if (scrollFrame !== null) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null
    visiblePendingSkipped.value = pendingSkipped
    if (consoleEl.value) consoleEl.value.scrollTop = consoleEl.value.scrollHeight
  })
}

function resetConsole() {
  consoleLines.value = []
  pendingSkipped = 0
  visiblePendingSkipped.value = 0
  lastFilesSkipped = props.status.filesSkipped
}

onMounted(resetConsole)

watch(() => props.status.startedAt, resetConsole)

watch(
  () => props.status.filesSkipped,
  (next) => {
    const delta = next - lastFilesSkipped
    lastFilesSkipped = next
    if (delta > 0) {
      pendingSkipped += delta
      scheduleFrame()
    }
  },
)

watch(
  () => props.status.currentFile,
  (next, prev) => {
    // A real file starting ends any skip streak in progress — commit it as one line.
    if (next) flushSkipped()
    if (prev && prev !== next) {
      const failed = props.status.errors.some((err) => err.startsWith(`${prev}:`))
      pushEntry({ kind: 'file', file: shortName(prev), ok: !failed })
    }
    scheduleFrame()
  },
)

watch(
  () => props.status.finishedAt,
  (next) => {
    if (!next) return
    flushSkipped()
    scheduleFrame()
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
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
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
      class="flex max-h-[13.5rem] flex-col overflow-y-auto rounded-md bg-sunken px-2 py-1.5 font-mono text-xs leading-10"
    >
      <p v-for="(entry, i) in consoleLines" :key="i" class="truncate text-tertiary">
        <template v-if="entry.kind === 'file'">
          <span :class="entry.ok ? 'text-tertiary' : 'text-down'">{{ entry.ok ? '✓' : '✗' }}</span>
          {{ entry.file }}
        </template>
        <template v-else>
          <span class="text-tertiary">⤳</span>
          {{ entry.count }} unchanged
        </template>
      </p>
      <p v-if="currentFileName" class="truncate text-secondary">
        <span class="text-accent">▸</span> {{ currentFileName }}…
      </p>
      <p v-else-if="visiblePendingSkipped > 0" class="truncate text-secondary">
        <span class="text-tertiary">⤳</span> {{ visiblePendingSkipped }} unchanged…
      </p>
    </div>
  </div>
</template>
