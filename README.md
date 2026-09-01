# Site Uptime Checker

Uptime monitoring (checks, incidents, SSL, Lighthouse, WHOIS/DNS, screenshots) plus web-log
analytics for the same sites, in one dashboard.

## Monitoring

### Per-site check options

Beyond URL, interval and the degraded-response threshold, each site (Edit → the collapsible
sections) can carry:

- **Content assertions** — "body must contain / must not contain / must match (regex) / minimum
  size". Any failing assertion marks the check **down** regardless of the status code, and the
  assertion text becomes the incident cause. The regex is capped at 200 characters and only ever
  run against the first 256 KB of the body.
- **Request options** — HTTP method, custom headers (JSON object), request body, basic-auth
  credentials, a per-site timeout, a follow-redirects toggle, and an accepted-status expression
  (`200`, `200,204`, `200-299`, `2xx,3xx`) that takes precedence over the single "expected
  status".
- **Adaptive degraded threshold** — instead of a fixed millisecond number, flag a response that
  exceeds twice the trailing-7-day p95 (floored at 500 ms). Falls back to the fixed value until
  three days of rollups exist.
- **Content-change watch** — chunk-hashes the normalised body each check and raises a
  `content_changed` notification when more than *N%* of chunks differ from the last snapshot.
- **SLA target** — a percentage (e.g. `99.9`). When set, the site page shows an error-budget
  panel (achieved vs target, budget consumed, MTTR/MTBF, a 12-month trend) and the site appears
  on the fleet `/triage` page once the budget is blown.

> **Basic-auth passwords are stored in plaintext** in the local SQLite database, consistent with
> an app that has no login and a trusted-network deployment model. The password is never sent
> back to the browser (`hasAuthPass: true/false` is all the API exposes) and is only read
> server-side when a check runs. Clear it from the Edit form's "Clear stored password" box.

### Identifying the probes (allow-listing)

Every check / response-time request is sent with a descriptive `User-Agent`
(`SiteUptimeChecker/1.0 (uptime monitor)`) and an `X-Uptime-Monitor: SiteUptimeChecker` header,
so the traffic reads as synthetic monitoring rather than a real visitor or a scraper. Point a
firewall / WAF allow-list at the `X-Uptime-Monitor` header (stable, no UA parsing needed) or at
the User-Agent. Set `UPTIME_MONITOR_URL` to add a `+<url>` info link to the User-Agent,
`UPTIME_MONITOR_CONTACT` to send a `From:` operator email, or `UPTIME_USER_AGENT` to replace the
User-Agent string outright. Per-site custom request headers still override any of these.

### Daily rollups & retention

Raw `checks` rows are pruned after ~30 days by a once-a-day job (previously a delete on every
insert). Before pruning, that job writes a `daily_uptime` rollup per site per day — time-weighted
downtime, check counts and response-time percentiles — so the 90-day calendar, the adaptive
baseline and the SLA panel keep working past the raw-row horizon. On upgrade, existing history
still in `checks` is backfilled once at startup.

### Domain & certificate alerts

WHOIS expiry and DNS snapshots (already collected weekly) now raise notifications:
`domain_expiring` at the 60/30/14/7-day marks, `nameservers_changed` when the NS set changes, and
`ssl_issuer_changed` when a renewed certificate switches CA. All are suppressed during a
maintenance window.

### Triage & command palette

`/triage` is a fleet-wide, severity-ranked list of everything that wants attention — open
incidents, failing assertions, expiring certs/domains, recent content changes, degraded sites,
blown SLA budgets, recent log alerts, and paused or stale monitors. Press **⌘K / Ctrl-K**
anywhere for a fuzzy jump to any site, page, log tab or quick action.

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
`staging`, …), and `<server-ip>` is the server directory — an IP address or a hostname. Symlinks
are followed, so the logs can live wherever they already are on the box.

Recognised filenames (with optional `-YYYYMMDD` rotation suffix and `.gz`):

```
nginx-access.log    apache-access.log    nginx-error.log    apache-error.log    error.log
php-error.log       php-fpm-error.log    php-slow.log
mysqld-slow-query.log                    mysqld.log
```

An access-log base name may carry a `__tag` (e.g. `apache-access__ssl.log`,
`apache-access__example_com.log`) so one server directory can hold several access logs — an HTTP
domlog and an `-ssl_log`, or one per vhost — without colliding.

To attach the folder to a monitored site, open the site, choose **Edit**, and pick it under
**Log folder**. Folders that aren't linked to any site are still ingested and can be queried at
`/api/logs/<name>/…`.

> **Access-log formats.** `nginx-access.log` must be in the Pantheon-style format these logs are
> produced in: a double space after the timestamp and a trailing quoted `X-Forwarded-For` chain,
> from which the real client IP is taken. `apache-access.log` accepts Apache's stock `common`,
> `combined` and `vhost_combined` (with an optional trailing `%D`/`%T`) and takes the client IP
> from `%h` directly — behind a proxy/CDN that is the proxy address unless `mod_remoteip` rewrites
> it upstream. Lines that match neither are counted as parse errors, shown per run on the ingest
> panel.
>
> **Apache error timestamps** carry no timezone and are read as UTC (same as nginx's). Correct
> for UTC servers; a cPanel box on local time will be offset.

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

### `npm run logs:sync`

Pulls live logs into `log-ingress/` over `rsync`/`ssh` so ingestion has something to read. It
never opens the DuckDB store, so it is safe to run alongside the server or `logs:ingest`. Driven
by one config file — copy `log-sync.config.example.json` to `log-sync.config.json` (gitignored):

- **`pantheon`** — lists every accessible site with one `terminus site:list` call, keeps the
  non-frozen ones whose plan isn't in `excludePlans` (default `["Sandbox"]`, so Basic +
  Performance sync), resolves each `live` env's appserver/dbserver containers by DNS, and pulls
  `logs/nginx/`, `logs/php/` and (with `includeDb`) the dbserver `logs/` into
  `log-ingress/<folder>/live/<container-ip>/`. `alias` maps a Pantheon site name to a different
  folder (e.g. `charles-ives-society` → `charles-ives`); `include`/`exclude` narrow the set.
- **`servers`** — a `folder → { env, sources[] }` map for anything else. Each source is one SSH
  host with explicit `paths`, every entry a `{ remote, as }` pair where `remote` is a file or a
  glob and `as` is the canonical local name (validated against the recognised filenames at load).
  A glob's matches are renamed `<as>-<YYYYMMDD>[.gz]`, the date taken from the remote name or its
  mtime; two matches wanting the same local name is an error, never a silent overwrite. `host`
  may be a `Host` alias from your `~/.ssh/config` — then `user`, `port` and `identityFile` can
  all be omitted and ssh resolves them (set them anyway to override). `serverDir` (the folder
  name under `log-ingress/<folder>/<env>/`) defaults to `host`.

```bash
npm run logs:sync -- --dry-run                       # list every file that would transfer
npm run logs:sync -- --site pixna --site citl
npm run logs:sync -- --only-servers --jobs 8
npm run logs:sync -- --max-age-days 30 --then-ingest # bound a first backfill, then ingest
```

Key flags: `--dry-run`, `--site <name>` (repeatable), `--only-pantheon`, `--only-servers`,
`--jobs`, `--max-age-days <n>` (rotated archives only — live files always sync), `--then-ingest`,
`--config <path>`, `--terminus <path>`, `--no-progress`. Transfers use rsync's temp-file-then-
rename (never `--partial`/`--inplace`), so the ingester never sees a half-written file. A failed
host is reported at the end, not fatal. Exit `0` ok, `1` some transfers failed, `2` config
invalid.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `UPTIME_DATA_DIR` | `./.data` | Holds both databases, screenshots and the geoip mirror |
| `UPTIME_ROLLUP_RETENTION_DAYS` | `730` | `daily_uptime` rollup rows older than this are pruned daily (raw `checks` keep their own ~30-day window) |
| `UPTIME_LOG_INGRESS_DIR` | `./log-ingress` | Where log folders are looked for |
| `UPTIME_LOG_RETENTION_DAYS` | `90` | Log rows older than this are pruned daily |
| `UPTIME_LOG_WATCH` | unset | Set to `1` to also ingest on file changes (chokidar) |
| `UPTIME_USER_AGENT` | `SiteUptimeChecker/1.0 (uptime monitor)` | Replaces the whole `User-Agent` string sent on every check/response-time probe |
| `UPTIME_MONITOR_URL` | unset | Info/status page URL, folded into the default `User-Agent` as `+<url>` |
| `UPTIME_MONITOR_CONTACT` | unset | Operator email, sent as the RFC 7231 `From` header on every probe |
| `DUCKDB_MEMORY_LIMIT` | `1GB` | Memory ceiling for log queries — **the server only**, not `logs:ingest` |
| `DUCKDB_THREADS` | `2` | Threads DuckDB may use — server only |
| `UPTIME_URL` | `http://localhost:3000` | Server base URL the `logs:ingest` CLI hands off to |
| `UPTIME_CLI_TOKEN` | unset | If set, the DB-handoff endpoints require `Authorization: Bearer <it>` instead of being loopback-only |
| `UPTIME_INGEST_MEMORY` | `70%` | Default total DuckDB memory budget for `logs:ingest` |
| `UPTIME_LOG_SYNC_CONFIG` | `./log-sync.config.json` | Config file read by `logs:sync` |
| `UPTIME_TERMINUS_BIN` | `terminus` | Path to the `terminus` binary `logs:sync` shells out to |

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
