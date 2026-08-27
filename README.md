# Site Uptime Checker

Uptime monitoring (checks, incidents, SSL, Lighthouse, WHOIS/DNS, screenshots) plus web-log
analytics for the same sites, in one dashboard.

## Log analytics

Log data lives in its own DuckDB store at `.data/logs.duckdb`, separate from the SQLite database
that holds sites, checks and incidents. Nothing joins the two in SQL — a site is linked to its
logs by name, through the `log_slug` column.

### Getting logs in

Put (or symlink) log files under `log-ingress/`, in this layout:

```
log-ingress/<name>/<env>/<server-ip>/<logfile>
```

`<name>` is the folder you link a monitored site to, `<env>` is anything you like (`live`,
`staging`, …), and `<server-ip>` must look like an IP address — that is how a server directory is
told apart from anything else. Symlinks are followed, so the logs can live wherever they already
are on the box.

Recognised filenames (with optional `-YYYYMMDD` rotation suffix and `.gz`):

```
nginx-access.log   nginx-error.log   error.log
php-error.log      php-fpm-error.log php-slow.log
mysqld-slow-query.log                mysqld.log
```

To attach the folder to a monitored site, open the site, choose **Edit**, and pick it under
**Log folder**. Folders that aren't linked to any site are still ingested and can be queried at
`/api/logs/<name>/…`.

> **nginx access format.** The parser expects the format these logs are produced in: a double
> space after the timestamp and a trailing quoted `X-Forwarded-For` chain, from which the real
> client IP is taken. Standard combined-format lines will not match and are counted as parse
> errors — the ingest panel shows the count per run, so a format mismatch is visible rather than
> silent.

### Ingestion

Ingestion is incremental: each file's byte offset is recorded, so a re-run reads only what was
appended. Rotated and `.gz` files are read once; a live file that is rotated out (detected by a
change in the hash of its first 1KB, or by shrinking) is re-read from the start.

- **Automatic**: hourly in production, with a retention prune at local midnight.
- **Manual**: the **Ingest now** button on any site's Logs tab or the **/logs** page, or
  `POST /api/logs/ingest/run` (optionally `{ "slug": "<folder>" }` for one folder). This is the
  way to trigger a run in `nuxt dev`, where the schedulers stay off.
- **Bulk / CLI**: `npm run logs:ingest` — a parallel re-ingest that uses every core and a much
  larger memory budget than the in-process run. See below.

A run can be **stopped** at the next parser-safe boundary from the /logs page (or
`POST /api/logs/ingest/stop`), and individual folders can be **paused** so the scheduler, the
watcher and the CLI all skip them (`POST /api/logs/<slug>/pause` `{ "paused": true }`). Pause
state lives in SQLite so it survives a bulk CLI ingest holding the DuckDB store.

### The /logs status page

A top-level **Logs** nav item lists every folder in `log-ingress/` — including ones never
ingested and ones linked to no monitored site — with per-file import status (offset, lines,
parse errors, last error), pause/resume, per-folder ingest, and purge.

### `npm run logs:ingest`

The hourly in-process run is deliberately gentle: one file at a time, `DUCKDB_MEMORY_LIMIT` /
`DUCKDB_THREADS`, sharing the web server's process. For a large backfill that is too slow. The
CLI removes those limits:

- Parses files in parallel across `worker_threads` (default: cores − 1), each into its own
  scratch DuckDB, which the main process merges with `ATTACH` + a single `INSERT … SELECT` +
  offset-advance transaction (exactly-once per file).
- If a server is running, the CLI asks it to release the DuckDB store for the duration
  (`POST /api/logs/db/detach`), heartbeats progress back so the web UI keeps updating, and
  reattaches when done. Log analytics endpoints return `503` during the window; the /logs
  folder list keeps working. A crashed CLI is recovered by the server within ~60s (PID
  liveness + lease TTL). With no server running, the CLI just takes the file lock directly.

```bash
npm run logs:ingest -- --dry-run                 # show the schedule, write nothing
npm run logs:ingest -- --jobs 8 --site charles-ives
npm run logs:ingest -- --memory 80% --threads 12
```

Key flags: `--jobs`, `--memory <n%|nGB>`, `--threads`, `--site <slug>` (repeatable), `--force`
(abort a server-side run during the handoff), `--no-server`, `--dry-run`, `--keep-temp`,
`--no-progress`. `--help` lists them all. Log alerts are left to the server's next tick.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `UPTIME_DATA_DIR` | `./.data` | Holds both databases, screenshots and the geoip mirror |
| `UPTIME_LOG_INGRESS_DIR` | `./log-ingress` | Where log folders are looked for |
| `UPTIME_LOG_RETENTION_DAYS` | `90` | Log rows older than this are pruned daily |
| `UPTIME_LOG_WATCH` | unset | Set to `1` to also ingest on file changes (chokidar) |
| `DUCKDB_MEMORY_LIMIT` | `1GB` | Memory ceiling for log queries — **the server only**, not `logs:ingest` |
| `DUCKDB_THREADS` | `2` | Threads DuckDB may use — server only |
| `UPTIME_URL` | `http://localhost:3000` | Server base URL the `logs:ingest` CLI hands off to |
| `UPTIME_CLI_TOKEN` | unset | If set, the DB-handoff endpoints require `Authorization: Bearer <it>` instead of being loopback-only |
| `UPTIME_INGEST_MEMORY` | `70%` | Default total DuckDB memory budget for `logs:ingest` |

Retention deletes old log rows but deliberately keeps the ingest bookkeeping for files that still
exist, so a pruned file is not simply re-ingested on the next run.

---

## Nuxt

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
