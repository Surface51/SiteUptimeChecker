import chokidar, { type FSWatcher } from 'chokidar'
import { getLogIngressDir } from '../config'
import { runIngest, getIngestStatus } from './queue'

let watcher: FSWatcher | null = null
let debounceTimer: NodeJS.Timeout | null = null

const DEBOUNCE_MS = 5000

function scheduleIngest() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (getIngestStatus().running) {
      // an ingest is already in flight (e.g. triggered manually); reschedule rather than skip
      scheduleIngest()
      return
    }
    runIngest().catch((err) => {
      console.error('[logs] watch-triggered ingest failed:', err)
    })
  }, DEBOUNCE_MS)
}

export function startLogWatcher(): void {
  if (watcher) return

  const root = getLogIngressDir()
  // depth 3 covers the <site>/<env>/<server-ip>/<logfile> layout discovery expects.
  watcher = chokidar.watch(root, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 },
    depth: 3
  })

  watcher.on('add', scheduleIngest)
  watcher.on('change', scheduleIngest)

  console.log(`[logs] watching ${root} for log changes`)
}

export function stopLogWatcher(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  watcher?.close()
  watcher = null
}

export function isLogWatching(): boolean {
  return watcher !== null
}
