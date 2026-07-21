import type { LighthouseJob } from '#shared/types'

// Module-level (singleton) state — every component sees the same poll results, and `ping()`
// can be called from anywhere (the per-site "Run reports" button, the dashboard bulk button)
// to make the panel appear immediately instead of waiting for the next tick.
const active = ref<LighthouseJob[]>([])
const recent = ref<LighthouseJob[]>([])
let interval: ReturnType<typeof setInterval> | undefined
let refCount = 0
const seenFailureIds = new Set<string>()
// Skip toasting on the very first poll — otherwise every pre-existing failure already sitting
// in the "recent" window fires at once on page load.
let seededOnce = false

const IDLE_POLL_MS = 4000
const ACTIVE_POLL_MS = 1000

async function poll() {
  try {
    const data = await $fetch<{ active: LighthouseJob[]; recent: LighthouseJob[] }>('/api/lighthouse/progress')
    active.value = data.active
    recent.value = data.recent
    notifyNewFailures(data.recent)
  } catch {
    // transient — next tick will retry
  }
  restartTimer()
}

function notifyNewFailures(jobs: LighthouseJob[]) {
  const { push } = useToasts()
  for (const job of jobs) {
    if (job.status !== 'error' || seenFailureIds.has(job.id)) continue
    seenFailureIds.add(job.id)
    if (seededOnce) push(`Lighthouse (${job.formFactor}) failed for ${job.siteLabel}: ${job.error}`, 'error')
  }
  seededOnce = true
}

function restartTimer() {
  if (interval) clearTimeout(interval as unknown as number)
  interval = setTimeout(poll, active.value.length ? ACTIVE_POLL_MS : IDLE_POLL_MS)
}

export function useLighthouseProgress() {
  onMounted(() => {
    refCount++
    if (refCount === 1) poll()
  })
  onUnmounted(() => {
    refCount--
    if (refCount === 0 && interval) {
      clearTimeout(interval as unknown as number)
      interval = undefined
    }
  })

  const currentJob = computed(() => active.value.find((j) => j.status === 'running') ?? null)
  const queueLength = computed(() => active.value.filter((j) => j.status === 'queued').length)
  const isRunning = computed(() => active.value.length > 0)

  /** Call right after triggering a run so the panel reflects it without waiting for the idle poll interval. */
  function ping() {
    void poll()
  }

  return { active, recent, currentJob, queueLength, isRunning, ping }
}
