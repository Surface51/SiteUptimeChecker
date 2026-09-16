<script setup lang="ts">
import type { IngestStatus } from '#shared/types'

const props = defineProps<{ status: IngestStatus; progress: number }>()
const emit = defineEmits<{ close: [] }>()

function shortName(path: string) {
  return path.split('/').slice(-3).join('/')
}

const consoleEl = ref<HTMLElement | null>(null)
let scrollFrame: number | null = null

// Coalesces however many status updates land between paints into a single DOM write, so a
// burst of SSE messages costs at most one reflow per frame, not one per message.
function scheduleScroll() {
  if (scrollFrame !== null) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null
    if (consoleEl.value) consoleEl.value.scrollTop = consoleEl.value.scrollHeight
  })
}

watch(() => props.status.log.length, scheduleScroll)
watch(() => props.status.currentFile, scheduleScroll)
watch(() => props.status.filesSkipped, scheduleScroll)
onMounted(scheduleScroll)
onUnmounted(() => {
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
})

const currentFileName = computed(
  () => (props.status.currentFile ? shortName(props.status.currentFile) : null),
)

// The current folder's skip streak isn't committed to status.log until it closes (the next
// folder starts, or the run ends) — derive the live "still going" count as filesSkipped minus
// whatever's already been committed, so there's still a live indicator while it's building up.
const livePendingSkipped = computed(() => {
  const committed = props.status.log.reduce(
    (sum, entry) => (entry.kind === 'folder-skipped' || entry.kind === 'skip-tally' ? sum + entry.count : sum),
    0,
  )
  return props.status.filesSkipped - committed
})

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

const finishedLabel = computed(() => {
  if (!props.status.finishedAt) return null
  const when = new Date(props.status.finishedAt)
  return Number.isNaN(when.getTime()) ? null : when.toLocaleString()
})

const ranForLabel = computed(() => {
  const { startedAt, finishedAt } = props.status
  if (!startedAt || !finishedAt) return null
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  return Number.isNaN(ms) ? null : formatDuration(ms)
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
      <span class="flex items-center gap-3">
        {{ progress }}%
        <button
          v-if="!status.running"
          type="button"
          class="cursor-pointer text-tertiary transition-colors hover:text-primary"
          aria-label="Dismiss"
          @click="emit('close')"
        >
          <UiIcon name="close" :size="16" />
        </button>
      </span>
    </div>
    <div v-if="!status.running && finishedLabel" class="text-xs text-tertiary">
      Finished {{ finishedLabel }}
      <span v-if="ranForLabel">· took {{ ranForLabel }}</span>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-sunken">
      <div
        class="h-full rounded-full bg-accent transition-[width] duration-300 ease-snappy"
        :style="{ width: `${progress}%` }"
      />
    </div>
    <div
      ref="consoleEl"
      class="max-h-[13rem] overflow-y-auto rounded-md bg-sunken px-2 py-1.5 font-mono text-xs leading-4"
    >
      <p
        v-for="(entry, i) in status.log"
        :key="i"
        class="break-all"
        :class="entry.kind === 'file' || entry.kind === 'skip-tally' ? 'pl-3 text-tertiary' : 'text-secondary'"
      >
        <template v-if="entry.kind === 'folder'">{{ entry.folder }}</template>
        <template v-else-if="entry.kind === 'folder-skipped'">
          <span class="text-tertiary">⤳</span> {{ entry.folder }} skipped
          <span class="text-tertiary/70">({{ entry.count }} {{ entry.count === 1 ? 'file' : 'files' }})</span>
        </template>
        <template v-else-if="entry.kind === 'skip-tally'">
          <span class="text-tertiary">⤳</span> {{ entry.count }} {{ entry.count === 1 ? 'file' : 'files' }} skipped
        </template>
        <template v-else>
          <span :class="entry.ok ? 'text-tertiary' : 'text-down'">{{ entry.ok ? '✓' : '✗' }}</span>
          {{ entry.file }}
        </template>
      </p>
      <p v-if="currentFileName" class="break-all text-secondary">
        <span class="text-accent">▸</span> {{ currentFileName }}…
      </p>
      <p v-else-if="livePendingSkipped > 0" class="break-all text-secondary">
        <span class="text-tertiary">⤳</span> {{ status.currentFolder }} — {{ livePendingSkipped }} unchanged…
      </p>
    </div>
  </div>
</template>
