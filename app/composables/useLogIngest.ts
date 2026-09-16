import type { IngestStatus } from '#shared/types'

export type { IngestStatus }

const EMPTY: IngestStatus = {
  running: false,
  stopRequested: false,
  stoppedReason: null,
  source: 'server',
  startedAt: null,
  finishedAt: null,
  filesTotal: 0,
  filesDone: 0,
  filesSkipped: 0,
  currentFolder: null,
  currentFile: null,
  currentFileBytesTotal: 0,
  currentFileBytesDone: 0,
  errors: [],
  log: [],
}

// Module-level singleton, like useLighthouseProgress: one event stream shared by every mounted
// consumer, so the panel and any other view stay in step without opening a stream each.
const status = ref<IngestStatus>({ ...EMPTY })
const connected = ref(false)
// Whether the progress view is collapsed to its header. A singleton alongside `status` — every
// view shares one run's status, so collapsing it is a property of the run, not the view.
const collapsed = ref(false)
let source: EventSource | null = null
let refCount = 0

/** Fires when a run finishes, so views can refetch now that there are new rows. */
const finishListeners = new Set<() => void>()

function open() {
  if (source || !import.meta.client) return

  source = new EventSource('/api/logs/ingest/events')
  source.onopen = () => {
    connected.value = true
  }
  source.onmessage = (event) => {
    try {
      const next = JSON.parse(event.data) as IngestStatus
      const wasRunning = status.value.running
      status.value = next
      // A new run starting re-expands the view — you want to see progress once it's live.
      if (!wasRunning && next.running) collapsed.value = false
      if (wasRunning && !next.running) {
        for (const listener of finishListeners) listener()
      }
    } catch {
      // a malformed frame is not worth tearing the stream down for
    }
  }
  source.onerror = () => {
    // EventSource reconnects on its own; just reflect that we're not currently live.
    connected.value = false
  }
}

function close() {
  source?.close()
  source = null
  connected.value = false
}

export function useLogIngest() {
  onMounted(() => {
    refCount++
    if (refCount === 1) open()
  })
  onUnmounted(() => {
    refCount--
    if (refCount === 0) close()
  })

  const progress = computed(() => {
    const { filesTotal, filesDone } = status.value
    return filesTotal > 0 ? Math.round((filesDone / filesTotal) * 100) : 0
  })

  // Whether there's anything to show at all: a run in progress, or a finished one. Stays true
  // across the running→finished transition so the view doesn't disappear on its own.
  const hasRun = computed(() => status.value.running || status.value.startedAt !== null)

  function toggleCollapsed() {
    collapsed.value = !collapsed.value
  }

  const starting = ref(false)
  const stopping = ref(false)

  async function runIngest(slug?: string) {
    starting.value = true
    try {
      await $fetch('/api/logs/ingest/run', {
        method: 'POST',
        body: slug ? { slug } : undefined,
      })
    } finally {
      starting.value = false
    }
  }

  async function stopIngest() {
    stopping.value = true
    try {
      await $fetch('/api/logs/ingest/stop', { method: 'POST' })
    } finally {
      stopping.value = false
    }
  }

  /** Registers a callback for run completion, cleaned up with the calling component. */
  function onFinished(fn: () => void) {
    finishListeners.add(fn)
    onUnmounted(() => finishListeners.delete(fn))
  }

  return {
    status,
    connected,
    progress,
    starting,
    stopping,
    hasRun,
    collapsed,
    toggleCollapsed,
    runIngest,
    stopIngest,
    onFinished,
  }
}
