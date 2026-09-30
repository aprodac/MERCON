# MERCON Infrastructure Forensic Audit — 2026-09-30

Scope: Hostinger VPS `srv1752379` (production + dev for mercon.tech), the
GitHub Actions deployment chain, and everything between.

**No changes were made** to the VPS, GitHub settings, secrets, workflows,
firewall, DNS or database during this audit.

## How this audit was done (and its limits)

| Source | What it gave | Limit |
|---|---|---|
| Hostinger API (connector) | VM spec, state, 7-day CPU/RAM/disk/network metrics, Docker Compose projects, container health + stats, backups, snapshots, firewall, action history | **No shell.** The connector has no command-execution endpoint. `ssh`, `df`, `du`, `ss`, `ufw`, `sshd_config`, `crontab`, `systemctl`, `last/lastb`, runner `_work` sizes, `psql` could **not** be run. Docker log endpoint returned HTTP 500. |
| Repository (`origin/main` @ `d3a5fe2e`) | Workflows, compose file, nginx config, provisioning scripts | Shows intent, not necessarily what is on disk |
| GitHub Actions API | Run history, which commit deployed when | Cannot list secret *names* (no API tool for it) |
| External HTTPS probes from this sandbox | Status/latency of mercon.tech, api., dev., Socket.IO | This sandbox's egress proxy blocks raw TCP and re-signs TLS, so **port exposure and the real certificate expiry could not be tested from outside** |

Legend: **VERIFIED** = observed directly · **INFERRED** = follows from verified
evidence · **UNKNOWN** = needs a shell on the VPS.

---

## A. Executive summary

1. **Production is up and serving correctly** (VERIFIED): `https://mercon.tech` 200, `/api/health` → `db: connected`, Socket.IO handshake 200, HTTP→HTTPS 301. Response times ~1.0–1.3 s.
2. **There is no SSH deployment.** A GitHub self-hosted runner lives *on the production VPS* (`/root/actions-runner`) and runs every deploy, backup, seed and sync workflow locally with passwordless `sudo` and Docker access, which is root-equivalent (VERIFIED from workflows + compose path). Anyone who can push a branch or open a PR against `main` can run code as root on production (**P0 security**).
3. **Production uploads are stored in `/tmp`** (`/tmp/mercon-uploads`, `/tmp/uploads` bind mounts, VERIFIED in `docker-compose.yml`). On Ubuntu `/tmp` is emptied at boot, and the VPS has not rebooted in ~110 days. The next reboot (kernel update, Hostinger maintenance, `restart`) will very likely **delete every uploaded document** (**P0 data loss**, INFERRED). No workflow backs uploads up.
4. **Prod and dev deploy from the same runner workspace directory** (`/root/actions-runner/_work/MERCON/MERCON`). After a dev deploy, the directory that the production Compose project points at holds *dev* code (INFERRED, P1). If anyone rebuilds or restarts prod from hPanel's Docker manager, it builds dev code.
5. **Every dev push erases the server's logs**: `ci-cd-dev.yml` truncates all of `/var/log/*.log` (including `auth.log`), deletes rotated logs, vacuums journald to 1 day and truncates **production** container logs (VERIFIED in workflow). There is effectively no audit trail or forensic history (**P1**).
6. **Another project's Postgres is published on the internet**: `mesiri-postgres` binds `0.0.0.0:5432` / `[::]:5432` (VERIFIED). No Hostinger firewall is attached (VERIFIED: 0 firewalls). Docker-published ports bypass UFW, so it is very likely reachable publicly (INFERRED, **P0**). MERCON's own API/frontend (3050/3060) are also bound on all interfaces, which bypasses nginx (P2).
7. **Disk is 52% used (28.1 GB of 53.7 GB), but it swings by ~15–18 GB**: the peak was 40.5 GB (75%) on 23 Sep, with drops of 17.7 GB (24 Sep 13:20 UTC, prod deploy's `docker builder prune`) and 14.5 GB (26 Sep 04:49 UTC). Growth tracks Docker builds, and cleanup only happens as a side effect of deploys (VERIFIED metrics). There is no disk alerting.
8. **The machine is small for what it runs**: KVM 1 = **1 vCPU, 4 GB RAM** hosting prod stack + dev stack + mesiri (Postgres, Redis) + builds. RAM peaked at 3.88 GB (26 Sep). An OOM kill of buildx and the runner is documented on 27 Sep. The frontend build sets `NODE_OPTIONS=--max-old-space-size=4096`, which exceeds the host (P1).
9. **Backups exist but are same-host or short-lived**: a daily `pg_dump` goes to `/var/backups/mercon` (same disk, 7-day retention) plus a 14-day GitHub artifact. Hostinger weekly image backups keep only 2 (18 Sep, 25 Sep). There is no snapshot. **Uploads are not backed up. No restore test was found.**
10. **The frontend container shows `unhealthy` but works.** Its healthcheck (`wget http://localhost/healthz`) resolves `localhost` to IPv6 `::1`, while the container's nginx listens on IPv4 only (`listen 80;`). `/healthz` returns `ok` through the real proxy (VERIFIED). This is a false alarm, but it means the health signal is useless (P2).

---

## B. Actual architecture (from evidence)

```text
                         Users (web dashboard, driver app, operator app)
                                        │  HTTPS
                                        ▼
        mercon.tech / www / api.mercon.tech / dev.mercon.tech  (DNS → 187.127.180.98)
                                        │
┌───────────────────────── Hostinger VPS srv1752379 (KVM 1, Ubuntu 24.04) ─────────────────────────┐
│  No Hostinger firewall attached · UFW/iptables state UNKNOWN (no shell)                         │
│                                                                                                 │
│  Host nginx 1.24.0 (TLS: /etc/letsencrypt/live/mercon.tech)                                     │
│    mercon.tech        /api/*, /uploads/*, /socket.io/*  → 127.0.0.1:3050                        │
│                       /                                 → 127.0.0.1:3060                        │
│    api.mercon.tech    /                                 → 127.0.0.1:3050                        │
│    dev.mercon.tech    → 3051 / 3061 (dev stack)                                                 │
│                                                                                                 │
│  Docker                                                                                         │
│   ├─ project "mercon" (prod)   compose file: /root/actions-runner/_work/MERCON/MERCON/          │
│   │    mercon-api       :3050 on 0.0.0.0/::   healthy   768 MB cap   uploads ← /tmp/mercon-uploads│
│   │    mercon-frontend  :3060 on 0.0.0.0/::   "unhealthy" (false alarm)  256 MB cap             │
│   │    mercon-postgres  127.0.0.1:15432       healthy   512 MB cap   volume pgdata              │
│   ├─ project "mercon-dev"  (same workspace dir; hidden from Hostinger's list — INFERRED)         │
│   │    dev-api :3051 · dev-frontend :3061 · dev-postgres 127.0.0.1:15433                       │
│   └─ project "mesiri" (/opt/mesiri, NOT MERCON)                                                 │
│        mesiri-postgres  0.0.0.0:5432 / [::]:5432   ← PUBLIC                                     │
│        mesiri-redis     127.0.0.1:6379                                                          │
│                                                                                                 │
│  GitHub Actions self-hosted runner  /root/actions-runner  (sudo + docker = root)                │
│    ◄── outbound HTTPS long-poll to GitHub (no inbound SSH involved)                             │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
          ▲
          │ jobs: ci-cd.yml (main), ci-cd-dev.yml (dev), backup-db (cron), release-check (PR→main),
          │       seed-db, db-inspect, demo-data, sync-dev-from-prod, sync-prod-from-dev (manual)
     GitHub aprodac/MERCON
```

---

## C. VPS health

| Metric | Value | Status |
|---|---|---|
| Plan | Hostinger **KVM 1** (DC 23, backup node `my-kul-1`) | VERIFIED |
| OS | Ubuntu 24.04 LTS (template 1077) | VERIFIED |
| CPU | **1 vCPU**. Baseline 6–9%, build spikes to 30–65% | VERIFIED |
| RAM | 4096 MB. Now 1.54 GB used; 2.1–2.3 GB typical before 27 Sep; **peak 3.88 GB** (26 Sep 04:20 UTC) | VERIFIED |
| Swap | UNKNOWN | — |
| Disk | 50 GiB (53.7 GB). **28.1 GB used (52%)** now; 7-day range 14.9–40.5 GB | VERIFIED |
| Inodes | UNKNOWN | — |
| Load | UNKNOWN (CPU% only) | — |
| Uptime | **~109.7 days**. Not rebooted since provisioning (2026-06-12). Kernel patches since then are not active | VERIFIED |
| Public IP | 187.127.180.98 / 2a02:4780:63:feb7::1, PTR `srv1752379.hstgr.cloud` | VERIFIED |
| Resolvers | 153.92.2.6, 1.1.1.1 | VERIFIED |

## D. Current services

| Service | Running | Version | Port | Owner/started by | Criticality |
|---|---|---|---|---|---|
| nginx (host) | yes | 1.24.0 (Ubuntu) | 80/443 | systemd; config pushed by `ci-cd.yml` | Critical |
| mercon-api | yes, healthy, up 3 d | image `mercon-mercon-api` (local build, main `d3a5fe2e`) | 0.0.0.0:3050 | compose `mercon` via runner | Critical |
| mercon-frontend | yes, "unhealthy" | `mercon-mercon-frontend` (nginx:alpine) | 0.0.0.0:3060 | compose `mercon` | Critical |
| mercon-postgres | yes, healthy, up 5 d | postgres:15-alpine | 127.0.0.1:15432 | compose `mercon` | Critical |
| dev stack | yes (dev.mercon.tech healthy) | built from `dev` | 3051/3061/15433 | compose `mercon-dev` | Low (but shares host) |
| mesiri-postgres | yes, up 2 months | postgres:16-alpine | **0.0.0.0:5432** | compose `/opt/mesiri` | Other product |
| mesiri-redis | yes | redis:7-alpine | 127.0.0.1:6379 | compose `/opt/mesiri` | Other product |
| GitHub runner | yes (jobs completing today) | UNKNOWN | outbound only | `/root/actions-runner` | Critical (root) |
| sshd, cron, ufw, certbot timer | UNKNOWN | — | — | — | — |

## E. Docker

| Component | Count/Size | Status | Problem |
|---|---|---|---|
| Compose projects | 3 (mercon, mercon-dev, mesiri); Hostinger lists 2 | running | mercon and mercon-dev share one compose directory |
| Containers | 3 prod + 3 dev + 2 mesiri | all running | frontend healthcheck false-negative |
| Images | local builds, no registry, no tags beyond `latest` | — | **No rollback image**: each deploy overwrites `mercon-mercon-api:latest` |
| Build cache / images on disk | ~15–18 GB swings | pruned only during deploys | no scheduled cleanup, no alert |
| Logs | json-file, 20 MB × 3 per container (VERIFIED in compose) | bounded | dev deploy truncates prod logs anyway |
| Resource caps | prod: api 768 MB/0.75 CPU, pg 512 MB/0.5, fe 256 MB/0.25 | set | Postgres 512 MB cap is tight but OK at current size |
| Root/privileged/socket mounts | UNKNOWN (need `docker inspect`) | — | — |

## F. GitHub Actions

- **Production branch:** `main`. `ci-cd.yml` runs on push to `main`, on `self-hosted`, with `concurrency: ci-cd-main` (queued, not cancelled). Last run: **#1084, 2026-09-27 09:31 UTC, success, `d3a5fe2e` "Release 2026-09-27"**.
- **Dev branch:** `dev`. `ci-cd-dev.yml` deploys `mercon-dev` on every push to `dev` (#2146 today 09:25 UTC, success).
- **Runner:** one self-hosted runner on the prod VPS, installed at `/root/actions-runner`. There is no SSH hop; the runner polls GitHub over HTTPS.
- **Deploy steps (prod):** native `git fetch <sha>` + `checkout --force` + `git clean -fdx` in the shared workspace → `client-secrets.sh ensure/export` (per-client encryption key in `/etc/aprodac/clients/mercon/secrets.env`) → `sed` host `nginx.conf` → prune build cache older than 24 h + dangling images → build api, then frontend (sequential, because of the OOM) → **`pg_dump` pre-deploy backup; an empty dump aborts** → `prisma migrate deploy` in a one-off container → `compose up -d --no-build` → wait up to 60 s for api health + `curl 127.0.0.1:3050/health` → copy nginx confs, `nginx -t`, reload. On failure it prints restore instructions.
- **Good:** migrations run before containers are swapped, there is a backup gate and a health gate, `migrate deploy` (not `db push`) is used, and builds are sequential.
- **Failure points / fragility:**
  - The shared workspace between prod, dev, backup, sync, seed and inspect jobs (see N).
  - There is no image tag per commit, so **there is no fast rollback**. Rollback means reverting on `main` and rebuilding (~8 min) on a 1-vCPU box.
  - Nginx is reloaded *after* the containers are replaced. A bad nginx config fails the job but leaves new containers running.
  - `sudo sed -i 's/client_max_body_size.*/…/'` edits the host `nginx.conf` blindly on every deploy (config drift the repo doesn't own).
  - `chmod -R 777` on upload dirs.
  - The runner's `.git` fetches without `--depth` on an existing clone and never runs `git gc`, so history accumulates (size UNKNOWN; this is the known `.git` pack growth pattern).
  - `release-check.yml` runs on **`pull_request` → main on the self-hosted runner**. A PR's workflow definition executes on the prod host.
  - Branch pushes to `Adarsh`/`dev` created failed `ci-cd.yml` runs on 19–22 Sep (older branch copies of the workflow). These are harmless but noisy.

## G. GitHub secrets (metadata only — values never read)

Secret names could not be listed (no API tool). Existence below is inferred from workflow behaviour.

| Secret | Exists | Referenced by | Purpose | Status |
|---|---|---|---|---|
| JWT_SECRET | **YES** (deploy aborts if empty; the 27 Sep deploy passed) | ci-cd, ci-cd-dev (fallback) | API auth signing | OK. **Also used by dev if DEV_JWT_SECRET is missing** |
| POSTGRES_USER / POSTGRES_PASSWORD | **YES** (same logic) | ci-cd, dev fallback, backup, sync, inspect, demo, release-check | DB auth | OK |
| SEED_ADMIN_PASSWORD | **YES** (same logic) | ci-cd, dev fallback | seed admin | OK |
| GEMINI_API_KEY | UNKNOWN | ci-cd, dev | OCR/AI | Workflow comment says an old key is in git history and **must be rotated**. Rotation status UNKNOWN |
| GEMINI_MODEL, ICCES_USER/PASS/ACCT, VITE_GOOGLE_MAPS_API_KEY | UNKNOWN (optional) | ci-cd, dev | integrations | — |
| DEV_* (JWT, POSTGRES_*, SEED, ICCES, GEMINI) | UNKNOWN | ci-cd-dev, inspect, sync | dev isolation | **If absent, dev silently uses the prod secret or a hardcoded literal committed in `ci-cd-dev.yml`** (password, JWT secret, admin password). The literals are in git history and should be treated as public |
| DATABASE_URL | UNKNOWN | seed-db.yml only | seed | possibly obsolete |
| EXPO_TOKEN | likely YES (EAS build succeeded 29 Sep) | eas-build | mobile builds | OK |
| SSH_PRIVATE_KEY / VPS_HOST | **not referenced anywhere** | — | — | Not needed: there is no SSH deploy |
| DATA_ENCRYPTION_KEY | **not in GitHub**, by design | on VPS `/etc/aprodac/clients/<client>/secrets.env` (600) | field encryption | Good design. **It is not backed up anywhere outside the VPS** (see L) |

## H. SSH

- Deployment does **not** use SSH (VERIFIED: no workflow references an SSH key or host).
- The Hostinger API endpoint for panel-attached SSH keys returned 404. Root password was set via hPanel on 2026-07-04 (VERIFIED action log).
- `sshd_config`, port, `PermitRootLogin`, `PasswordAuthentication`, `authorized_keys`, `last`/`lastb`: **UNKNOWN (no shell)**. `auth.log` is truncated on every dev deploy, so login history probably no longer exists.
- Effective privilege: the runner runs from `/root` and uses non-interactive `sudo`, so **GitHub job ⇒ root** (VERIFIED from workflow behaviour).

## I. Network

| Port | Service | Public? | Required? | Risk |
|---|---|---|---|---|
| 80/443 | host nginx | yes (VERIFIED) | yes | No HSTS/CSP/X-Frame headers; `Server` header shows version |
| 22 | sshd | likely | yes | config UNKNOWN |
| **5432** | **mesiri-postgres** | **bound 0.0.0.0/:: (VERIFIED); reachability INFERRED** | no | **P0**: internet-exposed database, brute-force target |
| 3050 | mercon-api | bound 0.0.0.0/:: | only via nginx | P2: bypasses nginx (no TLS, no body limit) |
| 3060 | mercon-frontend | bound 0.0.0.0/:: | only via nginx | P2 |
| 3051/3061 | dev api/frontend | compose default is all interfaces (INFERRED) | only via nginx | P2 |
| 15432/15433 | prod/dev postgres | 127.0.0.1 only (VERIFIED prod) | SSH tunnel | OK |
| 6379 | mesiri-redis | 127.0.0.1 only | — | OK |

Hostinger cloud firewall: **none configured** (VERIFIED). UFW does not filter Docker-published ports (Docker writes its own iptables chains). So the Hostinger firewall is the effective control, and it is absent.

## J. Database

- PostgreSQL **15-alpine** in Docker (`mercon-postgres`), data in the named volume `pgdata`, localhost-only on 15432. Healthy, up 5 days, ~55 MB RAM (VERIFIED).
- Size, connections, WAL, autovacuum: **UNKNOWN** (no shell). The Hostinger image-backup deltas of ~22–24 MB suggest the DB is small.
- Migrations: **`prisma migrate deploy`**, preceded by a mandatory pre-deploy `pg_dump` (VERIFIED). Good.
- Risky manual workflows exist:
  - `sync-prod-from-dev.yml` overwrites all prod data with `pg_restore --clean`. Its safety backup is written to `/tmp` with `|| true`, so **a failed backup does not stop the overwrite**.
  - `demo-data.yml` writes demo rows to the hosted DB (tagged and purgeable, but CLAUDE.md forbids demo data).
  - `seed-db.yml` uses a separate `DATABASE_URL` secret.

## K. Disk forensics

From Hostinger metrics (7 days, VERIFIED):

| When (UTC) | Used | Event |
|---|---|---|
| 23 Sep 00:18 | 34.3 GB | — |
| 23 Sep 19:49 | **40.5 GB (75%)** | peak after builds |
| 24 Sep 13:20 | 21.4 GB | **−17.7 GB** during prod release (#1083, `docker builder prune --filter until=24h`) |
| 25 Sep 13:49 → 22:16 | 23.6 → 29.3 GB | +5.7 GB in 8.5 h of dev builds |
| 26 Sep 04:49 | 14.9 GB | **−14.5 GB** (trigger UNKNOWN; not a prod deploy) |
| 27 Sep 08:46 | 24.1 GB | +9.2 GB in 28 h |
| 27 Sep 09:19–10:00 | 27.5–27.8 GB | prod release #1084 |
| 29 Sep 03:46 → now | ~28.1 GB | stable despite ~8 dev deploys (cache reused) |

Interpretation:
- Disk use is driven by **Docker image layers + BuildKit cache from two stacks built on one host** (INFERRED from timing). Dev deploys only prune dangling images and keep BuildKit cache, so cache grows until a prod deploy prunes anything older than 24 h.
- Runner `_work` / `.git` pack size, `/var/lib/docker` breakdown, `/var/backups/mercon`, `/tmp/mercon-uploads`: **UNKNOWN**. These are the first thing to measure with a shell (commands in R).
- Logs are *not* a disk risk today, but only because the dev workflow destroys them.

## L. Backup / recovery

```text
Backup exists:          YES — daily pg_dump (/var/backups/mercon, 7 d) + pre-deploy dumps (7 d)
                        + GitHub artifact (14 d) + Hostinger weekly image (2 kept: 18 Sep, 25 Sep)
Last successful backup: DB dump: backup-db run #11, 2026-09-30 07:32 UTC (success)
                        VPS image: 2026-09-25 11:54 UTC
Offsite:                PARTIAL — GitHub artifact (DB only, 14 days, readable by anyone with repo read access = customer PII)
                        and Hostinger PBS (same provider)
Uploads backed up:      NO (and they live in /tmp)
Encryption key backed up: NO (only on the VPS; losing it makes encrypted fields unreadable)
Snapshot:               NONE
Restore tested:         No evidence found
Recovery confidence:    LOW for documents/uploads, MEDIUM for database rows
```

A full rebuild of the VPS would need: the repo (OK), GitHub secrets (OK), a DB dump (OK, ≤ 24 h old), **plus `/etc/aprodac/clients/*/secrets.env`, uploads, the host nginx/letsencrypt config and the runner registration. None of these are backed up off-host.**

## M. Security findings

| P | Finding | Evidence |
|---|---|---|
| **P0** | GitHub → self-hosted runner → sudo/docker → **root on prod**. Triggerable by any push to `dev`/`main`, any PR to `main` (`release-check.yml`), and manual dispatch | workflows |
| **P0** | `mesiri-postgres` published on 0.0.0.0:5432 with no cloud firewall | Hostinger API |
| **P1** | All server logs (`auth.log`, syslog, journald > 1 d, prod container logs) erased on every dev push, so intrusions cannot be detected or investigated | `ci-cd-dev.yml` lines 31–38 |
| **P1** | Dev may share prod `JWT_SECRET` / DB creds, and committed plaintext fallback credentials exist | `ci-cd-dev.yml` env |
| **P1** | Kernel not rebooted in ~110 days | uptime metric |
| **P1** | Prod DB dumps with PII kept as GitHub artifacts for 14 days | `backup-db.yml` |
| P2 | API/frontend bound to 0.0.0.0 (bypass nginx) | compose |
| P2 | `chmod -R 777` on upload dirs | `ci-cd.yml` |
| P2 | No HSTS / security headers; nginx version disclosed | curl -I |
| P2 | Gemini key known leaked in history; rotation unconfirmed | workflow comment |
| P3 | `demo-data.yml` exists despite the "never seed demo data" rule | repo |

## N. Configuration drift

| Layer | Version | Status |
|---|---|---|
| GitHub `main` | `d3a5fe2e` (27 Sep) | — |
| Prod containers | built by run #1084 from `d3a5fe2e`; api up since 27 Sep | **matches main** (INFERRED from timing + status) |
| VPS workspace (compose dir of prod) | most recently checked out by dev run #2146 → **`dev` @ `c6789d3e`** | **drift: prod's compose dir holds dev code** (INFERRED) |
| `dev` vs `main` | dev is many commits ahead, with several additive migrations not yet on prod (e.g. `20260929…`, `20260930…`) | expected until the next release |
| Host nginx | pushed from repo each prod deploy, **plus unowned `sed` edits** to `nginx.conf` | partial drift |
| hPanel | a "docker_compose_update" was run from the Hostinger panel on 2026-09-07 | out-of-band change path exists |

---

## O. Root-cause findings (P0/P1)

**1. Uploads in /tmp** — P0
- *Evidence:* compose mounts `/tmp/mercon-uploads` and `/tmp/uploads` into the API container; the comment says prod's path "is literally /tmp/uploads".
- *Root cause:* a historical default that was preserved on purpose, to avoid moving prod to an empty directory.
- *Impact:* on reboot, systemd-tmpfiles clears `/tmp` (Ubuntu default), which loses all documents, PODs, photos and logos.
- *Recurrence:* certain on the first reboot.
- *Fix:* create `/var/lib/mercon/uploads`, `rsync -a` the current files there, change the mount (the dev stack already uses `/var/lib/mercon/dev-uploads`), deploy, verify, then add uploads to the backup. Until then, **do not reboot the VPS** and take a Hostinger snapshot.
- *Risk of fix:* low if copied before switching. *Rollback:* point the mount back.

**2. Runner = root on production** — P0
- *Evidence:* `runs-on: self-hosted` in 9 workflows including a `pull_request` one; `sudo` everywhere; runner in `/root`.
- *Root cause:* CI and prod share one machine and one identity.
- *Impact:* one compromised GitHub account or one malicious PR gives full server + DB + key compromise.
- *Fix (staged):*
  1. GitHub settings: restrict Actions on self-hosted runners to `main`/`dev` via a runner group plus environment protection (required reviewers) for prod.
  2. Move `release-check.yml`'s self-hosted job to read-only (or GitHub-hosted with a read-only DB user).
  3. Run the runner as a dedicated `deploy` user with a sudoers allow-list (nginx reload, `client-secrets.sh`).
  4. Longer term, build images on GitHub-hosted runners and push to GHCR; the VPS only pulls.
- *Risk of fix:* medium (touches deploy); do it with a maintenance window.

**3. Shared prod/dev workspace** — P1
- *Evidence:* both workflows check out into `$GITHUB_WORKSPACE` on one runner; Hostinger lists prod's compose path inside it and does not list `mercon-dev` separately.
- *Impact:* an hPanel "restart/update" or a manual `docker compose up` in that dir rebuilds prod from dev code; `git clean -fdx` from another job can remove files prod relies on.
- *Fix:* deploy prod from a fixed release dir (e.g. `/opt/mercon/prod`, `git worktree` or rsync of the checked-out SHA) and dev from `/opt/mercon/dev`; run compose with `--project-directory`.

**4. Logs wiped every dev deploy** — P1
- *Evidence:* `ci-cd-dev.yml` step 1.
- *Root cause:* emergency disk-space fix left in place.
- *Fix:* remove the truncation and instead rely on logrotate plus journald `SystemMaxUse=200M`. Docker logs are already capped by compose.

**5. No disk / resource monitoring; builds on a 1-vCPU/4 GB prod host** — P1
- *Evidence:* 75% peak, 3.88 GB RAM peak, the documented OOM.
- *Fix:* scheduled `docker builder prune --filter until=72h --keep-storage 5GB`; alert at 80% disk and 90% RAM (Hostinger metrics or a small cron to a webhook); move builds off the box (see 2). Upgrade to KVM 2 only if builds stay on-host.

**6. mesiri-postgres public** — P0 (not MERCON code, same host)
- *Fix:* bind to `127.0.0.1:5432` in `/opt/mesiri/docker-compose.yml`, or create a Hostinger firewall allowing only 22/80/443. **Confirm first that no external client relies on it.**

**7. Recovery gaps** — P1
- *Fix:* take a Hostinger snapshot now; back up uploads and `/etc/aprodac/clients` off-host (encrypted); do a quarterly restore drill of a dump into a scratch Postgres.

## P. Remediation plan (ordered)

**P0**
1. Take a Hostinger **snapshot** (non-destructive; none exists).
2. Do not reboot until uploads are moved out of `/tmp`.
3. Move prod uploads to `/var/lib/mercon/uploads` (code change + data copy).
4. Close public 5432 (mesiri) with a Hostinger firewall allowing 22, 80 and 443 only.
5. Lock down who can run jobs on the self-hosted runner (branch/environment protection; no PR-triggered jobs on it).

**P1**
6. Remove the log wiping from `ci-cd-dev.yml` and configure journald/logrotate limits.
7. Separate prod/dev deploy directories.
8. Set the DEV_* secrets and remove hardcoded fallbacks.
9. Add disk/RAM alerts and a scheduled BuildKit prune.
10. Back up uploads and the client key off-host; do a restore drill.
11. Reboot for the kernel *after* 1–3, in a maintenance window.
12. Guard `sync-prod-from-dev.yml` so a failed backup aborts; write the backup to `/var/backups`.

**P2**
13. Bind 3050/3060/3051/3061 to 127.0.0.1.
14. Fix the frontend healthcheck (`wget -qO- http://127.0.0.1/healthz`).
15. Tag images per commit to allow a fast rollback.
16. Replace `chmod 777`.
17. Stop the `sed` edits to host `nginx.conf`.
18. Add HSTS and security headers.

**P3**
19. Build on GitHub-hosted runners, deploy by pulling from GHCR.
20. Retire `demo-data.yml` and `seed-db.yml` if unused.
21. Add `git gc` / shallow fetch in the runner workspace.

## Q. Changes already made

None on infrastructure. The only change is this report file on branch
`alan-infrastructure-saver`.

## R. Changes still requiring approval / a shell

Needs owner approval: every P0–P2 item above that touches the firewall, the
runner, workflows, compose mounts, secrets, a reboot or mesiri.

Needs someone with SSH to run (read-only) and paste output, to close the UNKNOWNs:

```bash
df -h; df -i; free -h; swapon --show; uptime
sudo du -xh --max-depth=1 / /var /root 2>/dev/null | sort -rh | head -30
sudo du -sh /root/actions-runner/_work/* /root/actions-runner/_work/MERCON/MERCON/.git
sudo du -sh /tmp/mercon-uploads /tmp/uploads /var/backups/mercon /var/lib/mercon/*
docker system df -v | head -60
sudo ss -tulpn; sudo ufw status verbose; sudo iptables -S DOCKER-USER
sudo sshd -T | grep -Ei 'port|permitroot|passwordauth|pubkeyauth|allowusers'
ps -o user= -p $(pgrep -f Runner.Listener); sudo -l -U <that user>
cat /usr/lib/tmpfiles.d/tmp.conf /etc/tmpfiles.d/*.conf 2>/dev/null | grep -v '^#'
sudo certbot certificates; systemctl list-timers | grep -Ei 'certbot|apt|tmpfiles'
git -C /root/actions-runner/_work/MERCON/MERCON log -1 --oneline
docker inspect mercon-api --format '{{.Config.Labels}}' | tr ' ' '\n' | grep -E 'working_dir|config_files'
docker exec mercon-postgres psql -U "$POSTGRES_USER" -d mercon_db -c "select pg_size_pretty(pg_database_size('mercon_db')), (select count(*) from pg_stat_activity);"
```

## S. Final verification checklist (current state)

```text
[x] VPS healthy (running, low baseline load)
[~] Disk has sufficient headroom (52% now; peaked 75%)
[ ] Disk growth monitored
[ ] Runner workspace controlled (shared prod/dev, size unknown)
[x] GitHub Actions works (prod #1084, dev #2146 green)
[n/a] SSH deployment works (no SSH deploy exists — runner is local)
[~] Secrets correctly wired (prod required ones present; dev fallbacks unsafe)
[ ] No secrets exposed (hardcoded dev fallbacks; leaked Gemini key in history)
[ ] Firewall correctly configured (none)
[ ] Only required ports exposed (5432, 3050, 3060 on all interfaces)
[~] Docker healthy (frontend false "unhealthy")
[~] Logs have retention (capped, but wiped by dev deploys)
[x] PostgreSQL healthy
[x] MERCON PostgreSQL not public (mesiri's is)
[x] Backups exist (DB)
[ ] Backup restoration verified
[x] Nginx/reverse proxy healthy
[?] SSL valid (could not read the real cert through this sandbox's proxy)
[x] API healthy
[x] Frontend healthy (serving)
[x] Socket.IO healthy (polling handshake 200)
[x] Prisma migration strategy safe (migrate deploy + pre-backup gate)
[x] Production commit verified (d3a5fe2e, by run history)
[ ] Deployment reproducible (host-side sed edits, shared dir, no image tags)
[~] Rollback documented (DB restore printed on failure; no image rollback)
[ ] Monitoring/alerts configured
[ ] Recovery procedure documented (uploads + client key not covered)
```
