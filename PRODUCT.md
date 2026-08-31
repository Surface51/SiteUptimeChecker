# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the **Surface 51 in-house ops/dev team** — a small internal group at the
web agency Surface 51, monitoring a fleet of client sites (largely Pantheon-hosted
WordPress/Drupal) from a self-hosted internal deployment.

They use it to know at a glance whether client sites are up, to investigate an
incident by correlating synthetic checks with the site's real server logs from the
same screen, and to stay ahead of domain/cert expiry and SLA burn across the whole
fleet. There is no separate "viewer" or "customer" audience today.

## Product Purpose

Uptime monitoring (HTTP/SSL checks, incidents, Lighthouse, WHOIS/DNS, screenshots)
**and** web-server log analytics (nginx/Apache access + error, PHP error/FPM/slow,
MySQL slow/general) for the **same set of sites**, in one dashboard.

It exists so an agency can run its own monitoring and log forensics without a
per-monitor SaaS bill and without shipping client traffic data to a third party.
Success: the team catches a problem — or its precursor — from this dashboard before
a client reports it, and can explain what happened without leaving the app.

## Positioning

Claims a neighboring product (Pingdom, UptimeRobot, Better Uptime) could not
truthfully make, all confirmed as core:

- **Uptime + web-log analytics for the same fleet, in one place.** Synthetic checks
  and real server-log analytics are correlated on one screen; incident context
  pulls the matching log window automatically.
- **Local-first, no account, no SaaS.** All data lives on the operator's own box
  (SQLite for sites/checks/incidents; DuckDB for parsed logs). No login, no
  third-party service, no per-monitor pricing.
- **Deep per-site forensics.** Lighthouse runs, WHOIS/DNS snapshots, cert-issuer
  and nameserver-change alerts, content-diff watch, adaptive degraded baselines,
  SLA error budgets, and content assertions — per site.
- **Agency / Pantheon fleet workflow.** One command (`logs:sync`) pulls logs for
  every Pantheon site the agency manages; `/triage` ranks the entire fleet by what
  needs attention right now.

## Operating Context

- **Deployment:** single-tenant, self-hosted, local-first. Currently no login; runs
  on a trusted network (LAN/VPN). A login / hardening layer is a plausible future
  direction — new work should not hard-assume single-user forever — but multi-tenant
  or public SaaS is explicitly **not** a goal.
- **Two separate stores, never joined in SQL:** SQLite (`.data/`, holds
  sites/checks/incidents/notifications/rollups) and DuckDB (`.data/logs.duckdb`,
  holds parsed log rows). A site links to its logs by name via `log_slug`.
- **Log intake:** files land under `log-ingress/<name>/<env>/<server-ip>/<logfile>`.
  Ingestion is incremental (byte-offset resume). Schedulers run hourly in
  production and are off in `nuxt dev`, where ingest is triggered manually via the
  "Ingest now" button or the API.
- **CLIs:** `npm run logs:ingest` is a parallel backfill that borrows the DuckDB
  lock from a running server via a detach / heartbeat / reattach handoff (log
  endpoints return 503 during that window). `npm run logs:sync` pulls logs over
  rsync/ssh from Pantheon and other servers and never opens DuckDB.
- **Primary surfaces:** the fleet dashboard (`/`), the per-site report (a tabbed
  shell: overview, activity, performance, incidents, domain, and logs with its own
  sub-tabs), the `/logs` status page, `/triage`, `/compare`, and `/notifications`.
  A ⌘K / Ctrl-K command palette is available everywhere.
- **Trust model is stated, not hidden:** monitored-endpoint basic-auth passwords
  are stored in plaintext in local SQLite by design, consistent with an app that
  has no login and a trusted-network deployment; the password is never returned to
  the browser.

## Capabilities and Constraints

- **Checks:** interval, expected/accepted-status expression (`200`, `200,204`,
  `200-299`, `2xx,3xx`), fixed **or** adaptive degraded threshold (2× trailing-7-day
  p95, floored at 500 ms), content assertions (contain / not-contain / regex /
  min-size; regex capped at 200 chars, run over the first 256 KB), request options
  (method, headers, body, basic auth, timeout, follow-redirects), content-change
  watch, and a per-site SLA target.
- **Rollups & retention:** raw `checks` rows are pruned after ~30 days; a daily
  `daily_uptime` rollup per site per day keeps the 90-day calendar, adaptive
  baseline, and SLA panel working past the raw-row horizon. Existing history is
  backfilled once on upgrade.
- **Alerts / notifications:** incidents, failing assertions, `content_changed`,
  `domain_expiring` (60/30/14/7-day marks), `nameservers_changed`,
  `ssl_issuer_changed`. All suppressed during a maintenance window.
- **Log analytics:** nginx (Pantheon-style format required), Apache (stock common /
  combined / vhost_combined, optional trailing `%D`/`%T`), PHP error / FPM / slow,
  MySQL slow / general. Unparseable lines are counted and surfaced per run.
- **Technical stack (constrains component and charting choices, not up for
  re-decision here):** Nuxt 4 / Vue 3 / Tailwind v4, ECharts (via `vue-echarts`)
  for charts, `nuxt-anime` for motion, Playwright for screenshots, Lighthouse,
  `better-sqlite3`, `@duckdb/node-api`. An existing `app/components/ui/` library
  and a token layer in `app/assets/css/main.css` are the incumbent building blocks.

## Brand Commitments

- **Name:** "Site Uptime Checker." The identity is **Surface 51** (the agency).
- **Binding identity, flexible application** (user-confirmed): the S51 logo mark
  (`app/components/S51Logo.vue`), the Barlow / Barlow Semi Condensed typefaces, and
  the red accent (`#e4312b`) on black / white with light + dark themes are fixed and
  track surface51.com. Layout, components, spacing, and motion are open to redesign.
- The "Surface 51 design tokens" layer in `app/assets/css/main.css` and the `ui/`
  component set are the incumbent visual system (no standalone DESIGN.md yet).
- **Theme:** light / dark, with a pre-paint no-flash script and a first-visit splash
  animation (`AppSplash`) built on the S51 mark.
- **Voice:** terse, precise, technical, understated — as in the README and current
  UI labels. No established marketing voice; do not invent one.

## Evidence on Hand

- Real usage data exists locally under `.data/` (SQLite + DuckDB) with actual client
  sites being monitored. It is not checked into the repo.
- `README.md` is a thorough, current feature reference.
- Screenshot capture of monitored sites is a runtime feature
  (`server/routes/screenshots/`), not bundled image assets.
- **Absent — must not be fabricated:** there is no marketing copy, testimonials,
  case studies, press, pricing, customer logos, or public-facing landing content in
  this repo. surface51.com exists as the agency's site but its content is not
  vendored here.

## Product Principles

1. **One pane for "is it up" and "why."** Synthetic checks and server logs for the
   same site belong on the same screen; never force a context-switch to a second
   tool to explain an incident.
2. **Local-first and self-owned.** No external service dependency for core function
   and no per-monitor economics; the operator's own box holds the data.
3. **Fleet-first triage.** The default question is "what, across every client site,
   needs attention right now" — answered by severity ranking, not per-site hunting.
4. **Precursors over post-mortems.** Surface expiring domains, changed nameservers,
   renewed-cert issuer changes, content drift, and SLA burn before they become
   incidents.
5. **Honest about the trust model.** No login is a deliberate trusted-network
   choice, stated plainly rather than hidden; a future auth layer is additive, not
   a pivot.

## Accessibility & Inclusion

No formal standard or audit target. Baseline expectations for new work: full
keyboard navigation (command palette, tab shells, forms), readable contrast in both
themes, and not breaking screen readers. Carry forward the care already shown — e.g.
the degraded-status color was deliberately darkened for AA text contrast on white.
