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
- **Manual**: the **Ingest now** button on any site's Logs tab, or `POST /api/logs/ingest/run`.
  This is the way to trigger a run in `nuxt dev`, where the schedulers stay off.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `UPTIME_DATA_DIR` | `./.data` | Holds both databases, screenshots and the geoip mirror |
| `UPTIME_LOG_INGRESS_DIR` | `./log-ingress` | Where log folders are looked for |
| `UPTIME_LOG_RETENTION_DAYS` | `90` | Log rows older than this are pruned daily |
| `UPTIME_LOG_WATCH` | unset | Set to `1` to also ingest on file changes (chokidar) |
| `DUCKDB_MEMORY_LIMIT` | `1GB` | Memory ceiling for log queries |
| `DUCKDB_THREADS` | `2` | Threads DuckDB may use |

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
