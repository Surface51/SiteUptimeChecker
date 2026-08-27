import { closeDb, getDb } from '../utils/db'
import { startDomainInfoScheduler, stopDomainInfoScheduler } from '../utils/domainInfo'
import { startLighthouseScheduler, stopLighthouseScheduler } from '../utils/lighthouse'
import { isLogWatchEnabled } from '../utils/logs/config'
import { loadLogDbLeaseFromDisk } from '../utils/logs/dbLease'
import { resumeLeaseWatchdogIfDetached, setLogSchedulersManaged } from '../utils/logs/dbHandoff'
import { closeLogDb } from '../utils/logs/logDb'
import {
  startLogIngestScheduler,
  startLogRetentionScheduler,
  stopLogIngestScheduler,
  stopLogRetentionScheduler,
} from '../utils/logs/schedule'
import { closeBrowser } from '../utils/screenshot'
import { startScheduler, stopScheduler } from '../utils/scheduler'

export default defineNitroPlugin((nitroApp) => {
  getDb()

  // The log database is opened lazily on first use, not here: an install with nothing in
  // log-ingress should never pay for a DuckDB instance or hold its lock file.

  // A detach lease may have outlived a restart (notably `nuxt dev` HMR mid-CLI-run) — honour
  // it so this process doesn't fight the CLI for the file lock, and keep watching for the
  // holder to finish or die.
  loadLogDbLeaseFromDisk()
  resumeLeaseWatchdogIfDetached()

  // In `nuxt dev`, Nitro restarts on every server-side file change, which would otherwise
  // re-trigger uptime checks, Lighthouse audits, and WHOIS/DNS lookups for every site on every
  // save. Keep dev reads-only against the existing DB; only run the real schedulers in
  // production (`nuxt build` + start). Log ingestion can still be triggered by hand in dev via
  // POST /api/logs/ingest/run.
  if (!import.meta.dev) {
    startScheduler()
    startLighthouseScheduler()
    startDomainInfoScheduler()
    startLogIngestScheduler()
    startLogRetentionScheduler()
    // So a DB handoff knows to restart these when the CLI reattaches.
    setLogSchedulersManaged(true)

    if (isLogWatchEnabled()) {
      // Imported dynamically so chokidar is never loaded when watching is off.
      import('../utils/logs/ingest/watch')
        .then(({ startLogWatcher }) => startLogWatcher())
        .catch((err) => console.error('[logs] failed to start watcher:', err))
    }
  }

  nitroApp.hooks.hook('close', async () => {
    if (!import.meta.dev) {
      stopScheduler()
      stopLighthouseScheduler()
      stopDomainInfoScheduler()
      stopLogIngestScheduler()
      stopLogRetentionScheduler()

      if (isLogWatchEnabled()) {
        const { stopLogWatcher } = await import('../utils/logs/ingest/watch')
        stopLogWatcher()
      }
    }
    await closeBrowser()
    // Releases the DuckDB lock file, so a restart doesn't have to ride out its stale-PID retry.
    await closeLogDb()
    closeDb()
  })
})
