# Hosting plan — work workstation + Cloudflare Tunnel

Run Site Uptime Checker on your 32‑core / 64 GB Linux workstation at Surface 51, exposed
to the internal team through a Cloudflare Tunnel gated by Cloudflare Access. No inbound
ports, no public IP, ~$1/mo running cost.

> Working draft alongside `HOSTING.md`. Decisions baked in from our discussion:
> **Linux + systemd**, **no domain yet** (register one), **S51 internal team only**.

---

## 1. Architecture

```
                        Cloudflare edge (global)
  ┌───────────────────────────────────────────────────────────────┐
  │  DNS: uptime.<domain>  (proxied CNAME → tunnel)                │
  │  Access: allow  email ends with @surface51.com   (IdP login)  │
  └───────────────▲───────────────────────────────┬───────────────┘
        HTTPS 443 │ (team browsers)               │ outbound QUIC/443
                  │                     ┌─────────┴──────────┐
             team laptops               │ cloudflared.service │  ← your workstation
                                        │  (systemd, system)  │
                                        │        │ localhost   │
                                        │  siteuptime.service  │  node .output/server
                                        │  bound 127.0.0.1:3000│
                                        │  /srv/siteuptime/data│  SQLite + DuckDB + shots
                                        │  /srv/siteuptime/log-ingress
                                        │  siteuptime-sync.timer → logs:sync hourly
                                        └──────────────────────┘
                        R2 / NAS  ◀── nightly uptime.db + weekly restic snapshot
```

**Why this shape fits a workstation:**

- **`cloudflared` dials *out* on 443** and holds the tunnel open. Nothing listens on a
  public port; corporate NAT / firewall / CGNAT are irrelevant. If your IP changes
  (Wi‑Fi ↔ Ethernet, VPN up/down) the tunnel silently reconnects.
- **Cloudflare Access is the authentication** the app itself doesn't have. Every request
  to `uptime.<domain>` is bounced to an IdP login and checked against the policy before
  it ever reaches the tunnel. The origin is unreachable any other way.
- **32c/64 GB is lavish** for this. The real design problem is the opposite — stopping a
  bulk `logs:ingest` or a Lighthouse sweep from making *your desktop* stutter. Solved
  with systemd resource caps (Part 4).
- Runs as a **system service**, so it's up whenever the machine is powered on — no need
  to be logged in.

---

## 2. Read this before you build it

| Risk | Mitigation in this plan |
| --- | --- |
| **The monitor shares fate with one desktop.** If the workstation is off, asleep, reimaged by IT, or you leave — monitoring stops, *including the uptime checks themselves*. | Disable sleep (Part 3). Put it on a UPS. Add an **external meta‑monitor** on `uptime.<domain>` (Part 8) so a drop pages someone. Keep the DO Droplet plan (`HOSTING.md`) as the graduation path if this becomes business‑critical. |
| **A Cloudflare Tunnel is an authorized outbound reverse proxy** out of the corp network. | Get explicit sign‑off from whoever owns Surface 51 IT/security *before* installing `cloudflared`. It's just HTTPS to Cloudflare, but it should be a known, approved path, not a surprise. |
| **Client server‑logs will live on a machine under a desk.** | Full‑disk encryption (LUKS) on. Off‑box encrypted backups (Part 7). Screen lock. The `data` dir `chmod 750` owned by the service user. |
| **Someone reboots it for OS updates / it suspends overnight.** | Services are `enabled` → auto‑start on boot. Sleep/suspend masked (Part 3). Verify with a real reboot test (Part 8). |
| **The app has no login.** Access is the *only* thing between the internet and plaintext basic‑auth secrets in SQLite. | App binds `127.0.0.1` only. Whole hostname behind an Access policy. `ufw` default‑deny inbound as backstop. No second tunnel hostname without its own policy. |

---

## 3. Prepare the workstation OS

Assumes Ubuntu/Debian (`apt`); Fedora/Arch equivalents in brackets.

### 3.1 System packages + Node 24

```bash
sudo apt update
sudo apt install -y build-essential python3 git rsync openssh-client \
                    php-cli unzip sqlite3 ufw curl ca-certificates

# Node 24 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v24.x
```

### 3.2 Dedicated service user + directories

```bash
sudo useradd --system --create-home --home-dir /home/uptime --shell /bin/bash uptime

sudo mkdir -p /opt/siteuptime                       # code + build
sudo mkdir -p /srv/siteuptime/data                  # .data  (big disk)
sudo mkdir -p /srv/siteuptime/log-ingress           # raw logs (big disk)
sudo chown -R uptime:uptime /opt/siteuptime /srv/siteuptime
sudo chmod 750 /srv/siteuptime/data
```

If your "ample disk space" is a separate drive, mount it at `/srv/siteuptime` (add to
`/etc/fstab`) before creating the subdirs.

### 3.3 Stop the machine from sleeping

A workstation will suspend on idle (and Ubuntu even suspends at the GDM screen). Kill it:

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# GNOME per-machine (also flip "Automatic Suspend" off in Settings → Power):
sudo -u gdm dbus-launch gsettings set org.gnome.settings-daemon.plugins.power \
     sleep-inactive-ac-type 'nothing' 2>/dev/null || true
```

In `/etc/systemd/logind.conf` set `IdleAction=ignore` (and `HandleLidSwitch=ignore` if
it's ever a laptop), then `sudo systemctl restart systemd-logind`.

### 3.4 Firewall backstop

The tunnel is outbound‑only, so nothing inbound is needed:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH          # keep your own SSH in
sudo ufw enable
```

### 3.5 Build the app

```bash
sudo -iu uptime
git clone <repo-url> /opt/siteuptime && cd /opt/siteuptime
npm ci
PLAYWRIGHT_BROWSERS_PATH=/opt/siteuptime/.playwright \
  npx playwright install --with-deps chromium
NODE_OPTIONS=--max-old-space-size=4096 npm run build
exit
```

`--with-deps` needs sudo for the apt libs; if it prompts, run
`sudo npx playwright install-deps chromium` first, then the non‑root `install chromium`.

### 3.6 Environment file

`/etc/siteuptime.env` — `sudo chmod 640`, `sudo chown root:uptime`:

```ini
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
UPTIME_DATA_DIR=/srv/siteuptime/data
UPTIME_LOG_INGRESS_DIR=/srv/siteuptime/log-ingress
PLAYWRIGHT_BROWSERS_PATH=/opt/siteuptime/.playwright

# Server-side DuckDB query budget — modest; the box has 64 GB but this is background.
DUCKDB_MEMORY_LIMIT=6GB
DUCKDB_THREADS=6

# Bulk logs:ingest CLI budget (Part 6). 40% of 64 GB ≈ 25 GB; cap threads well under 32.
UPTIME_INGEST_MEMORY=24GB

# logs:sync
UPTIME_LOG_SYNC_CONFIG=/srv/siteuptime/log-sync.config.json
UPTIME_TERMINUS_BIN=/usr/local/bin/terminus
```

---

## 4. systemd services

### 4.1 The app — `/etc/systemd/system/siteuptime.service`

```ini
[Unit]
Description=Site Uptime Checker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=uptime
Group=uptime
WorkingDirectory=/opt/siteuptime
EnvironmentFile=/etc/siteuptime.env
ExecStart=/usr/bin/node .output/server/index.mjs
Restart=always
RestartSec=3

# --- Keep background work from ever freezing the desktop ---
CPUQuota=1600%          # at most 16 of 32 cores' worth
CPUWeight=30            # yields to interactive apps under contention
MemoryHigh=24G          # soft throttle
MemoryMax=40G           # hard ceiling (OOM-kill the service, not your session)
IOWeight=40
Nice=10

# --- Light hardening ---
NoNewPrivileges=true
PrivateTmp=true
ProtectControlGroups=true
ProtectKernelTunables=true

[Install]
WantedBy=multi-user.target
```

### 4.2 Log sync — timer + oneshot

`/etc/systemd/system/siteuptime-sync.service`:

```ini
[Unit]
Description=Site Uptime Checker — pull client logs (rsync/ssh/terminus)
After=network-online.target

[Service]
Type=oneshot
User=uptime
Group=uptime
WorkingDirectory=/opt/siteuptime
EnvironmentFile=/etc/siteuptime.env
ExecStart=/usr/bin/npm run logs:sync
Nice=15
IOWeight=20
CPUQuota=800%
```

`/etc/systemd/system/siteuptime-sync.timer`:

```ini
[Unit]
Description=Hourly log sync

[Timer]
OnBootSec=10min
OnUnitActiveSec=1h
Persistent=true

[Install]
WantedBy=timers.target
```

The server already ingests hourly in‑process; the timer only needs to *fetch*. Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now siteuptime.service
sudo systemctl enable --now siteuptime-sync.timer
curl -sS http://127.0.0.1:3000/ | head -c 200      # sanity: HTML comes back
```

---

## 5. Cloudflare: account, domain, tunnel

### 5.1 Account + domain

1. Create / use a Cloudflare account for Surface 51 (Free plan covers everything here).
2. **Register a domain** via **Cloudflare Registrar** (at‑cost, ~$10/yr for `.com`) —
   e.g. `s51ops.com`. Or register anywhere and point the nameservers at Cloudflare.
   *Alternative:* if `surface51.com` is available to you, delegate just
   `uptime.surface51.com` to Cloudflare instead of a new domain — ask whoever runs that
   DNS. Either way you end up with a zone in this Cloudflare account.
3. Pick the hostname now: **`uptime.s51ops.com`** (used throughout below).

### 5.2 Turn on Zero Trust

Cloudflare dashboard → **Zero Trust** → pick a team name → you get
`https://<team>.cloudflareaccess.com`. Choose the **Free** plan (50 users).

### 5.3 Create the tunnel (dashboard‑managed)

Zero Trust → **Networks → Tunnels → Create a tunnel → Cloudflared**. Name it
`s51-workstation`. It shows an install command with a token. On the workstation:

```bash
# Cloudflare apt repo
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared

# Install as a system service using the token from the dashboard
sudo cloudflared service install eyJhIjoi... 
systemctl status cloudflared        # should be active, "Registered tunnel connection"
```

### 5.4 Route the hostname to the app

Back in the tunnel's page → **Public Hostnames → Add a public hostname**:

| Field | Value |
| --- | --- |
| Subdomain | `uptime` |
| Domain | `s51ops.com` |
| Type | `HTTP` |
| URL | `127.0.0.1:3000` |

Save. Cloudflare auto‑creates the proxied `CNAME uptime → <tunnel-id>.cfargotunnel.com`.
Do **not** add any other public hostname on this tunnel unless it also gets an Access
policy.

At this point `https://uptime.s51ops.com` resolves and reaches the app — **but it is
still wide open**. Lock it down before sharing the URL:

---

## 6. Cloudflare Access: gate it to the S51 team

### 6.1 Identity provider

Zero Trust → **Settings → Authentication**. Two easy paths:

- **Google Workspace** (if Surface 51 uses Google for email): add **Google** as an IdP,
  authorize it against the `surface51.com` workspace. Cleanest — real SSO.
- **One‑time PIN** (no IdP setup): enabled by default. Access emails a 6‑digit code to
  the address the user types; the policy still restricts *which* addresses work.

### 6.2 Application + policy

Zero Trust → **Access → Applications → Add an application → Self‑hosted**:

| Field | Value |
| --- | --- |
| Application name | `Site Uptime Checker` |
| Session duration | `24 hours` |
| Application domain | `uptime.s51ops.com` |
| Identity providers | Google (and/or One‑time PIN) |

Then **Add policy**:

| Field | Value |
| --- | --- |
| Policy name | `S51 team` |
| Action | `Allow` |
| Include | Selector **Emails ending in** → `@surface51.com` |

(Optionally also add specific individual `Emails` for anyone off‑domain.) Everything not
matched is denied by default. Save.

### 6.3 Verify the lock

```bash
# From anywhere NOT logged in (or curl):
curl -sI https://uptime.s51ops.com/ | grep -i location
#   → 302 to https://<team>.cloudflareaccess.com/...   ✅ gated
```

Open it in a private browser window: you should hit the Cloudflare login, authenticate
as an `@surface51.com` user, then land on the dashboard. Try a non‑S51 address → denied.

### 6.4 CLI / curl access (optional)

For terminal use behind Access: `cloudflared access login https://uptime.s51ops.com`
opens a browser once, then `cloudflared access curl https://uptime.s51ops.com/api/...`
works with the cached token.

---

## 7. Backups

Full‑disk encryption should already be on (`lsblk -f` shows `crypto_LUKS`). If not, at
minimum keep the data dir on an encrypted volume.

**What matters, in order:**

| Data | Size | Replaceable? | Policy |
| --- | --- | --- | --- |
| `data/uptime.db` (SQLite) | ~5 MB | **No** — sites, checks, incidents, notifications | **Nightly**, off‑box |
| `data/logs.duckdb` | multi‑GB, grows | Slowly — re‑ingest from `log-ingress/` | **Weekly**, off‑box |
| `log-ingress/` | multi‑GB, grows | Partly — Pantheon rotates archives out | **Weekly**, off‑box |
| `data/screenshots/`, `data/geoip/` | small | Yes — regenerated | skip |

**Target:** Cloudflare **R2** (same account, 10 GB free, then ~$0.015/GB/mo, S3 API) via
`rclone`/`restic`; or a Surface 51 NAS via `restic`/`borg`.

`/etc/systemd/system/siteuptime-backup.service` (+ a daily `.timer`, `OnCalendar=*-*-* 02:30`):

```ini
[Service]
Type=oneshot
User=uptime
EnvironmentFile=/etc/siteuptime.env
Environment=RESTIC_REPOSITORY=s3:https://<acct>.r2.cloudflarestorage.com/s51-uptime-backup
Environment=RESTIC_PASSWORD_FILE=/etc/siteuptime-restic.pass
ExecStart=/usr/bin/sqlite3 /srv/siteuptime/data/uptime.db ".backup '/srv/siteuptime/data/uptime.db.bak'"
ExecStart=/usr/bin/restic backup --tag nightly /srv/siteuptime/data/uptime.db.bak
ExecStartPost=/usr/bin/restic forget --keep-daily 14 --keep-weekly 8 --prune
```

Add a weekly unit that also `restic backup`s `data/logs.duckdb` and `log-ingress/`.
`restic` de‑dups, so the growing DuckDB file doesn't cost a full copy each week.
**Test a restore** into a scratch dir once, now, not during an incident.

---

## 8. Operate

### 8.1 Deploy an update

`/opt/siteuptime/deploy.sh` (run as `uptime`):

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/siteuptime
git pull
npm ci
PLAYWRIGHT_BROWSERS_PATH=/opt/siteuptime/.playwright npx playwright install chromium
NODE_OPTIONS=--max-old-space-size=4096 npm run build
sudo systemctl restart siteuptime
```

### 8.2 First backfill (one‑off, manual)

```bash
sudo -iu uptime
cd /opt/siteuptime
npm run logs:sync -- --max-age-days 30      # bounded first pull
npm run logs:ingest -- --jobs 12 --threads 12 --memory 24GB
```

`--jobs 12` deliberately, not the default `cores-1` (31) — leaves your desktop headroom.
The CLI coordinates the DuckDB handoff with the running server automatically over
loopback; log endpoints return 503 for the ingest window.

### 8.3 Watch it

```bash
journalctl -u siteuptime -f
journalctl -u cloudflared -f
systemctl list-timers 'siteuptime*'
```

Cloudflare side: Zero Trust → Networks → Tunnels shows connector health; **Access → Logs**
shows every login. Turn on a tunnel health notification (Notifications → Add → Tunnel
Health) to email the team if the connector drops.

### 8.4 Meta‑monitor (important — it shares fate with your PC)

Point something *outside* the workstation at the hostname so you learn when it dies:

- Cheapest: an external checker (UptimeRobot free, or a `curl` cron on any other box)
  hitting `https://uptime.s51ops.com/` and expecting **HTTP 302** (the Access redirect).
  If the workstation or tunnel is down, Cloudflare returns `530`/`1033` instead — the
  check fails and you get paged.
- End‑to‑end: create an Access **service token**, add a second policy (Action *Service
  Auth*, Include *Service Token*), and have the external check send the
  `CF-Access-Client-Id/Secret` headers against `/api/tags` to confirm the origin, not
  just the edge.

### 8.5 Reboot test

Before you rely on it: `sudo reboot`, wait, then from another machine confirm
`https://uptime.s51ops.com` loads after login and `systemctl is-active siteuptime
cloudflared siteuptime-sync.timer` all report `active`.

---

## 9. Cost & when to move off

| Item | Cost |
| --- | --- |
| Domain (Cloudflare Registrar) | ~$10 / year |
| Cloudflare Tunnel + Access (Free, ≤50 users) | $0 |
| R2 backup (under ~50 GB) | < $1 / month |
| Compute | your workstation's power |

**Graduate to the DigitalOcean Droplet in `HOSTING.md`** if any of these become true:
the dashboard needs to be up when your machine isn't, IT won't bless the tunnel long‑term,
the log corpus outgrows the workstation's disk, or "who owns this box" becomes a real
question. The migration is: `restic restore` the `data/` + `log-ingress/` dirs onto the
Droplet, repoint the same Cloudflare tunnel (or a new one) at it, done — the Access
policy and hostname don't change.

---

## 10. Pre‑flight checklist

- [ ] IT/security sign‑off on running a Cloudflare Tunnel from the workstation
- [ ] Full‑disk encryption confirmed (`lsblk -f`)
- [ ] `sleep.target` masked; GNOME auto‑suspend off; reboot test passed
- [ ] App bound to `127.0.0.1` only (`ss -ltnp | grep 3000` shows `127.0.0.1`)
- [ ] `ufw` default‑deny inbound
- [ ] `/etc/siteuptime.env` is `640 root:uptime`; restic password file `600`
- [ ] `cloudflared` running as a system service, tunnel shows healthy
- [ ] Access policy tested: `@surface51.com` in, everyone else 302→denied
- [ ] No second public hostname on the tunnel without its own policy
- [ ] `terminus` authenticated + SSH keys installed under `/home/uptime/.ssh` for `logs:sync`
- [ ] Nightly `uptime.db` backup ran and a test restore worked
- [ ] External meta‑monitor on `uptime.s51ops.com` reporting green
- [ ] Tunnel Health notification enabled
```
