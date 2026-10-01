# MERCON Infrastructure Remediation — 2026-09-30

Follows `INFRA_AUDIT_2026-09-30.md`. Branch: `alan-infrastructure-saver`
(based on `dev`).

**Nothing in this branch is live yet.** Workflow and compose changes take
effect when the branch is merged into `dev` (dev server) and then released to
`main` (production), through the normal release PR. The only change made to a
live system is the Hostinger snapshot.

## 0. Corrections to the audit

The audit read the workflows on `main`. `dev` is ahead of `main`, and DNS shows
the dev server move (`docs/SERVER_MOVE_DEV.md`) has already happened:

| Audit said | Actually |
|---|---|
| Dev stack runs on the production VPS | **Outdated.** `dev.mercon.tech` → **82.29.167.128**. Dev jobs run on a runner labelled only `dev`; prod jobs on `[self-hosted, prod]`. The dev containers are gone from the prod VPS (Hostinger lists only `mercon` and `mesiri`). |
| Prod and dev share one runner workspace | **Partly outdated.** They are on different machines now. The prod workspace is still shared by the prod deploy and every other job on the prod runner (release-check on PRs, backup-db and db-inspect from the default branch `dev`, seed, demo, sync export). The live `mercon` Compose project still points there. |
| Dev deploy wipes the prod server's logs | **Moved, not gone.** It now wipes the dev server's logs. Prod logs have been left alone since the move. |
| Frontend healthcheck broken | **Already fixed on `dev`** (`127.0.0.1` instead of `localhost`). It ships with the next release. |
| `sync-prod-from-dev.yml` unsafe | **Already deleted on `dev`** (still present on `main` until the next release). |

## 1. Fixes completed (in this branch)

| Issue | Fix | Status | Verification |
|---|---|---|---|
| **P0 Uploads in `/tmp`** | `docker-compose.yml` mounts `/var/lib/mercon/<client>-app-uploads` and `/var/lib/mercon/<client>-uploads`. New `scripts/provision/migrate-uploads.sh` copies from `/tmp` (never moves or deletes), refuses if there is less than 2 GB headroom, then verifies every file by path and size, and exits non-zero on any miss. `ci-cd.yml` runs it before the DB backup (a failure stops the deploy with prod untouched) and again after the container swap. `ci-cd-dev.yml` does the same for dev. `sync-dev-from-prod.yml` reads the new paths. `chmod 777` replaced by owner uid 1000 (`node`) + mode 770. | ✅ code · ⏳ takes effect on release | Script tested: missing or empty source, normal copy, spaces in names, re-run (idempotent), file added between passes, conflicting file (fails, source intact), no-rsync fallback. `docker compose config` resolves prod → `/var/lib/mercon/mercon-*`, dev → `/var/lib/mercon/dev-*` (dev's current `dev-uploads` path unchanged). |
| **P0 Prod builds from a shared workspace** | `ci-cd.yml` checks out into **`/opt/mercon/prod`** (shallow fetch + `gc`, so `.git` stays about one commit; the token is removed from `.git/config` after the fetch). Build, migrate, `up` and nginx all run from there. Same project name `mercon` → same `mercon_pgdata` volume. | ✅ code · ⏳ release | actionlint clean; `bash -n` on every run block |
| **P1 API/dashboard on 0.0.0.0** | Ports published as `127.0.0.1:3050` / `127.0.0.1:3060` (dev `127.0.0.1:3051/3061`). Host nginx already proxies to `127.0.0.1`. No repo code, app config or doc uses `:3050`/`:3060` from outside. | ✅ code · ⏳ release | `docker compose config` shows `host_ip: 127.0.0.1` |
| **P1 Dev wipes logs** | Removed truncation of `/var/log/*`, `auth.log`, journald vacuum, all container-log truncation and `_diag` deletion. What remains is dangling images + build cache older than 72 h. | ✅ code · ⏳ merge to dev | |
| **P1 Dev falls back to prod secrets / committed passwords** | `ci-cd-dev.yml` and `db-inspect.yml` read `DEV_*` only. The deploy fails naming each missing required secret (`DEV_POSTGRES_USER`, `DEV_POSTGRES_PASSWORD`, `DEV_JWT_SECRET`, `DEV_SEED_ADMIN_PASSWORD`). ICCES/Gemini stay off on dev without their `DEV_*` secret. The literals are gone from the file (they remain in git history; treat them as public). | ✅ code · ⏳ merge to dev | |
| **P1 No fast rollback** | Deploy tags serving images `:previous` before building (one extra image set, not a growing pile). New manual **`rollback-prod.yml`** (type `ROLLBACK`; same concurrency group as deploys) swaps them back with no rebuild and health-checks. It never touches the DB. Failure output of `ci-cd.yml` points to it. | ✅ code · ⏳ release | |
| **P1 Deploy health gate misses the dashboard** | `ci-cd.yml` also requires `GET 127.0.0.1:3060/healthz` and reports disk use after the deploy. | ✅ code · ⏳ release | |
| **P1 No disk monitoring** | New **`disk-guard.yml`**: every 6 h on both servers. Reports disk + `docker system df`, prunes build cache older than 72 h and dangling images at ≥70%, and **fails at ≥85%** so the run is flagged and GitHub emails. Never touches volumes, tagged images, logs, uploads or backups. | ✅ code · ⏳ schedules run from the default branch (`dev`) after merge | |
| **P1 Dev and prod building at once** | Already solved by the dev-server move; prod builds are serialized by `concurrency: ci-cd-main`, which `rollback-prod.yml` shares. | ✅ (existing) | |
| **P1 `sync-prod-from-dev` fails open** | Workflow already deleted on `dev`. | ✅ (existing) | |
| **Recovery point** | Hostinger snapshot of the prod VPS created (id 382739) | ✅ **live** | Action `ct_snapshot_create` success 09:50:51 UTC. **Expires 2026-10-01 09:50 UTC** |

## 2. Fixes blocked

| Issue | Why blocked | What is needed |
|---|---|---|
| **PRs to `main` run on the prod runner** (`release-check.yml`, `pull_request` event: the PR's own copy of the workflow runs as root on production) | Switching it to `pull_request_target` was **refused by this session's safety policy** (it is a known-risky trigger). **NEEDS HUMAN DECISION.** | Choose one: **(a)** keep the report but move the prod-db ledger read off the runner (e.g. make it a manual `workflow_dispatch` job run before merging); **(b)** switch to `pull_request_target` yourself (safe only while no step builds or runs PR files, which is true today); **(c)** GitHub setting (below). |
| **Any branch push or PR can target `[self-hosted, prod]`** with a new workflow file | Workflow edits can't stop a *new* workflow. Needs GitHub admin settings. I have no API access to runner groups or secrets. **NEEDS GITHUB ADMIN** | Org → Settings → Actions → Runner groups: put `srv1752379` in a group limited to this repo and, if the plan allows, to **selected workflows** (`ci-cd.yml@refs/heads/main`, `backup-db.yml`, `rollback-prod.yml`, `disk-guard.yml`, `db-inspect.yml`, `seed-db.yml`, `demo-data.yml`, `sync-dev-from-prod.yml`). Protect `main` and `dev` (PR + review required). Settings → Actions → "Require approval for all outside collaborators". |
| **Runner runs as root with passwordless sudo** | OS-level. **BLOCKED — REQUIRES VPS SHELL ACCESS** | Create a `deploy` user in the `docker` group; reinstall the runner service as that user (`./svc.sh install deploy`); sudoers allow-list: `nginx -t`, `systemctl reload nginx`, `cp nginx/*.conf /etc/nginx/sites-available/`, `bash …/client-secrets.sh *`, `bash …/migrate-uploads.sh *`, `install -d /opt/mercon/prod`, `mkdir/chown /var/backups/mercon`. **Note:** `docker` group membership is still root-equivalent; the real boundary is the runner-group restriction above. Verify: `ps -o user= -p $(pgrep -f Runner.Listener)`. Risk: a missed sudo rule fails the next deploy (not prod), so test with a manual dispatch. |
| **mesiri-postgres on 0.0.0.0:5432** | Not MERCON. Its traffic (≈1 GB in/out over 2 months) could be a remote client. **BLOCKED — REQUIRES CONFIRMATION** from mesiri's owner, and a shell to check | On the VPS: `sudo ss -tnp state established '( sport = :5432 )'` and check `pg_stat_activity` client IPs. If all clients are local, change `/opt/mesiri/docker-compose.yml` to `"127.0.0.1:5432:5432"` and `docker compose -p mesiri up -d postgres`. Or create a Hostinger firewall allowing only 22/80/443 (also blocks 3050/3060 before the release lands). Verify: from outside, `nc -vz 187.127.180.98 5432` should fail. |
| **Hostinger firewall** (none exists) | Would change what the internet can reach, including mesiri. **NEEDS HUMAN APPROVAL** | I can create it via the Hostinger API once you confirm mesiri needs no external 5432: rules TCP 22, 80, 443 from any. |
| **Uploads + encryption key off-host backup** | Needs a storage destination and credentials (S3/B2/another server). **NEEDS EXTERNAL ACCESS** | Nightly `restic`/`rclone` of `/var/lib/mercon/*uploads*` and `/etc/aprodac/clients/` (encrypted repo) to off-host storage. Don't put the encryption key in GitHub artifacts. |
| **Kernel reboot (~110 days up)** | Must wait until uploads are off `/tmp`. **NEEDS HUMAN APPROVAL + maintenance window** | After the release carrying this branch has deployed and the migration output shows all files copied: take a fresh snapshot, then reboot (`hPanel` or the Hostinger API), then verify health. |
| **Remove old `/tmp` upload copies** | Deliberately not automated | After a week of normal operation: `sudo du -sh /tmp/mercon-uploads /tmp/uploads`, re-run `migrate-uploads.sh` to confirm nothing new, then remove by hand. |
| **Confirm DEV_* secrets exist** | No API to list secret names | GitHub → Settings → Secrets → Actions: check `DEV_POSTGRES_USER`, `DEV_POSTGRES_PASSWORD`, `DEV_JWT_SECRET`, `DEV_SEED_ADMIN_PASSWORD`. **The Postgres pair must match the user the dev DB volume was created with.** If dev had been using the prod values or literals, set `DEV_*` to those same values first, then rotate. Otherwise the next dev deploy fails (by design) or cannot log in to its database. |
| Disk breakdown, runner `_work`/`.git` size, SSH config, UFW | **BLOCKED — REQUIRES VPS SHELL ACCESS** | Command list in the audit, section R. |

## 3. Changes made

| # | Change | Where |
|---|---|---|
| 1 | Hostinger snapshot of VM 1752379 (non-destructive; expires in 24 h) | Hostinger API, 09:50 UTC |
| 2 | Branch rebuilt on `origin/dev` (the old base `alan` shares no history with `dev`/`main` and could never merge); audit commit carried over | git |
| 3 | `docker-compose.yml`: persistent upload mounts; API/dashboard ports on 127.0.0.1 | a08d671c |
| 4 | `scripts/provision/migrate-uploads.sh` (new) | a08d671c |
| 5 | `ci-cd.yml`: `/opt/mercon/prod` deploy dir, upload migration ×2, `:previous` images, dashboard health gate, disk report, rollback pointer; removed `/tmp` mkdir + `chmod 777` | a08d671c |
| 6 | `rollback-prod.yml` (new, manual) | a08d671c |
| 7 | `sync-dev-from-prod.yml`: new upload paths, dev dirs owned by uid 1000 | a08d671c |
| 8 | `ci-cd-dev.yml`: no log wiping, DEV_* only + missing-secret check, uploads off `/tmp` | 3a901845 |
| 9 | `db-inspect.yml`: no secret fallbacks | 3a901845 |
| 10 | `disk-guard.yml` (new) | 6149faaa |

Not changed: VPS files, firewall, SSH, DNS, GitHub settings/secrets, the database, mesiri.

## 4. Production verification (2026-09-30 ~10:00 UTC, after the snapshot)

```text
https://mercon.tech/                      200  1.40 s  (index.html)
https://mercon.tech/assets/index-*.js     200  456 KB
https://mercon.tech/api/health            200  {"success":true,...,"db":"connected"}
https://api.mercon.tech/health            200  db connected
https://mercon.tech/healthz               200  ok
https://mercon.tech/socket.io/?EIO=4&transport=polling  200  sid issued, upgrades ["websocket"]
http://mercon.tech/                       301 → https
https://dev.mercon.tech/api/health        200  db connected
Hostinger: mercon-api healthy (up 3 d) · mercon-postgres healthy (up 5 d) · mercon-frontend "unhealthy" (known false alarm, fix ships with next release)
```

When the release deploys, check in the `CI/CD Pipeline` log:
1. `migrate-uploads: … every source file present with the same size` for both directories, both passes.
2. `Deploying <sha> from /opt/mercon/prod`.
3. API and dashboard health lines.

Then check that `mercon-frontend` reports healthy in Hostinger, an old document opens, and a new upload works. From outside, `curl -m5 http://187.127.180.98:3050/health` should now time out.

## 5. Remaining risks

- Until the release ships: uploads are still in `/tmp` (**do not reboot**) and 3050/3060 are still published on all interfaces.
- The prod runner is still root-equivalent, and PRs to `main` still run `release-check.yml`'s PR copy on it (section 2).
- mesiri Postgres is still public.
- No off-host backup of uploads or the encryption key; no restore drill done.
- First deploy after merge: if `/tmp` uploads are large, the copy takes time and space. The script checks space and stops the deploy cleanly if short.
- The `sed` edits to host `nginx.conf` in `ci-cd.yml` remain (P2, not touched).
- The 24 h snapshot expires before the release unless retaken.

## 6. Next actions (need a human)

1. Confirm the `DEV_*` secrets (section 2) **before** merging this branch into `dev`.
2. Review and merge `alan-infrastructure-saver` → `dev`; watch the dev deploy and `disk-guard`.
3. Decide on `release-check.yml` (a/b/c above) and set the GitHub runner-group / branch protections.
4. **Retake the Hostinger snapshot right before** the `dev → main` release, then release; follow the checks in section 4.
5. Confirm mesiri's 5432 has no external clients, then approve the Hostinger firewall (22/80/443).
6. After the release: reboot in a maintenance window; set up the off-host backup of uploads + `/etc/aprodac/clients`; do one restore drill.
7. With SSH: move the runner off root (section 2).

---

# Second pass — security hardening (2026-09-30 / 10-01)

**Access in this pass:** the same as the first. There was **no shell on the
VPS**: no SSH key, no `ssh`, and port 22 is unreachable from the session
sandbox. Hostinger API was read-only apart from the snapshot. GitHub tools
can read Actions but not change runner groups, rulesets, environments or
secrets. So everything "on the VPS" below is either verified through the
Hostinger API / HTTPS, or explicitly marked **not verified**.

Deliberately not done: running diagnostics on production by dispatching a
modified workflow from this branch onto the prod runner. It would have worked,
which is the point of finding 1. But it means running unreviewed code as root
on production outside the release process.

## Remaining security findings

| P | Finding | Evidence | Status |
|---|---|---|---|
| **P0** | **Any repo writer can run code as root on production**: new workflow file on any branch, or `workflow_dispatch` of an existing manual workflow on their own branch, with `runs-on: [self-hosted, prod]` | GitHub semantics; runner is repo-scoped (`SERVER_MOVE_DEV.md`) | ⬜ GitHub settings: `RUNNER_AND_NETWORK_HARDENING.md` §1 |
| **P0** | **mesiri Postgres on 0.0.0.0/[::]:5432 with the compose file's default password** | Hostinger `vps_docker_get mesiri` (values not reproduced) | ⬜ needs SSH + mesiri owner, §3 |
| **P1** | **All production secrets are repository secrets**: every workflow on every branch (GitHub-hosted too) can read them | workflow `secrets.*` usage; no environments used for them | ⬜ GitHub settings §1 #5 |
| **P1** | mesiri's hPanel environment holds live third-party API keys, a JWT secret and a WhatsApp token **in plain text** (its `WHATSAPP_VERIFY_TOKEN` name suggests it is tied to MERCON's WhatsApp) | Hostinger API | ⬜ mesiri owner: move to a root-only env file, rotate |
| P1 | Runner runs as root; Docker group would be root-equivalent anyway | workflows; `/root/actions-runner` | ⬜ SSH, §2 (limited gain, stated honestly) |
| P1 | Kernel not rebooted in ~110 days | uptime metric 9,488,457 s | ⬜ after the release (uploads off `/tmp` first) |
| P2 | Gemini key and old dev passwords remain in git history | workflow comments | ⬜ rotate if not already |

## Fixes executed (this pass, in the branch)

| Fix | Commit | How verified |
|---|---|---|
| **No PR job runs on the production runner.** `release-check.yml` now runs only on `ubuntu-latest`. The production migration ledger is read by new **`prod-ledger.yml`** (after each deploy via `workflow_run`, every 6 h, manual; never on PRs, which always run the default-branch file) and handed over as an artifact. The report validates it as plain text and never executes it, and shows its timestamp. `pull_request_target` was **not** used. | ef27846a | actionlint; fetch step run with a stub `gh`: outputs identical to the old job's; an injected `$(rm -rf /)` line was dropped; missing ledger → clear block message |
| **Nightly restore test.** `backup-db.yml` restores each dump into a throwaway `postgres:15-alpine` (no network, tmpfs, 384 MB) and fails if table/migration counts differ from production | b121fae5 | Same `pg_dump -Fc` / `pg_restore --exit-on-error --no-owner --no-privileges` sequence run on a local Postgres built from the repo's migrations, dump owned by a non-superuser like prod: rc 0, 31/31 tables, 64/64 migrations |
| **Encrypted off-host backup of DB + uploads + encryption key.** With repo variable `BACKUP_AGE_RECIPIENT` set, one `age`-encrypted bundle (checksum-pinned age v1.2.1, streamed so no plaintext on disk) replaces the plaintext dump artifact | b121fae5 | Bundle step run in the sandbox against fake uploads and key at the real paths: checksum OK, decrypt → files byte-identical; restoring the DB from the decrypted dump → 31 tables / 64 migrations; no plaintext key left in the runner temp dir |
| **A failed deploy no longer leaves a broken release serving.** If the API never turns healthy, `/health` fails or the dashboard `/healthz` fails, `ci-cd.yml` puts the `:previous` images back, re-checks `/health` and still fails the job. The DB is not rolled back (additive migrations; pre-deploy dump printed) | d3c93686 | Deploy step run with stubbed docker/curl/sudo in 4 scenarios: healthy (no rollback) · unhealthy API (rollback, previous serving) · first deploy (no `:previous` → says so) · probe failure (rollback). Order unchanged: uploads copy → DB backup → migrate → swap → uploads pass 2 |
| Runbooks: `BACKUP_RESTORE.md`, `RUNNER_AND_NETWORK_HARDENING.md` | (docs commit) | — |
| Repo secret scan | — | Current tree: only test fixtures and `.env.example` files with no real values; no workflow echoes a secret |

## Fixes verified on the live VPS

**None of the branch's changes are live yet** (not merged). What was verified
live, read-only:

| Check | Result |
|---|---|
| Production stack | `mercon-api` healthy, `mercon-postgres` healthy, `mercon-frontend` "unhealthy" (known healthcheck bug, fixed on `dev`) — Hostinger API |
| Ports today | API/dashboard still `0.0.0.0:3050/3060` (fix ships with release); mesiri Postgres `0.0.0.0:5432` |
| Resources (Hostinger metrics, 30 Sep 06:00–12:00 UTC) | CPU 6.8–8.4%, RAM 1.52–1.57 GB / 4 GB, disk 28.1 GB (52%) flat. 7-day peaks: RAM 3.88 GB (26 Sep, during a build), disk 40.5 GB (23 Sep). Dev builds have since moved to their own server, which removes the main source of both peaks |
| Snapshot | Created 30 Sep 09:50 UTC, **expires 1 Oct 09:50 UTC** |
| External | see Production verification |

Not verifiable without a shell: real upload counts/sizes in `/tmp`, runner
user, sudoers, UFW/iptables, sshd, log rotation, `/var/backups` contents,
whether 5432 is reachable from the internet (Shodan has no record of the IP).

## Fixes blocked

| Item | Blocker | Runbook |
|---|---|---|
| Restrict which workflows/branches can use the prod runner | GitHub org admin settings | `RUNNER_AND_NETWORK_HARDENING.md` §1 |
| Production secrets into a `production` environment (main only) | GitHub admin | §1 #5 |
| Runner as `mercon-runner` with sudo allow-list | **BLOCKED — REQUIRES VPS SHELL ACCESS** | §2 |
| mesiri 5432 → 127.0.0.1, change its password; Hostinger firewall 22/80/443 | **BLOCKED — REQUIRES CONFIRMATION** (mesiri owner) **+ VPS shell** to inventory listening ports first | §3 |
| Upload migration on the real server (counts, sizes, newest/oldest, conflicts) | Runs automatically on the first prod deploy of this branch; `migrate-uploads.sh` prints before/after counts and sizes and stops the deploy on any mismatch. **NOT VERIFIED** until then | — |
| Restore test on real data | First nightly `backup-db` run after merge. **RESTORE TEST ON PRODUCTION DATA: NOT VERIFIED** | `BACKUP_RESTORE.md` |
| Off-host uploads backup beyond 1.5 GB | Needs object storage + credentials | `BACKUP_RESTORE.md` |
| Kernel reboot | After release + fresh snapshot, maintenance window | — |

## Changes requiring manual GitHub settings

1. Rulesets on `main` and `dev`: PR + 1 review, no force-push, restricted push.
2. Re-register the prod runner at org level, in a runner group limited to `aprodac/MERCON` and, if offered, to the branch-pinned workflows listed in §1.
3. Actions → General: approval for outside collaborators; default token read-only.
4. Environment `production` (branch `main`) holding the production secrets.
5. Variable `BACKUP_AGE_RECIPIENT` = your `age` public key (`BACKUP_RESTORE.md`).
6. Confirm `DEV_POSTGRES_USER`, `DEV_POSTGRES_PASSWORD`, `DEV_JWT_SECRET`, `DEV_SEED_ADMIN_PASSWORD` exist and match the dev database **before** merging to `dev`.

## Changes requiring human approval

- mesiri: confirm no external Postgres clients → bind to 127.0.0.1, change password, rotate its plain-text keys.
- Hostinger firewall (22/80/443 + anything `ss -tlnp` shows is needed).
- Reboot after the release.
- Deleting the old `/tmp` upload copies (after a week of healthy running).

## Production verification (1 Oct, after all branch work; nothing deployed)

See the command output in the session. mercon.tech / api.mercon.tech / `/api/health` (db connected) / `/healthz` / Socket.IO handshake / assets / HTTP→HTTPS all as before.

## Backup / recovery status

```text
Database backup exists:      YES — nightly + pre-deploy, /var/backups/mercon (7 d) + GitHub artifact (14 d)
Upload backup exists:        NO today (Hostinger weekly image only) · YES after merge + BACKUP_AGE_RECIPIENT set (≤1.5 GB)
Encryption key protected:    NO today · YES after merge + recipient set (inside the encrypted bundle)
Off-host:                    DB yes (plaintext artifact today); encrypted bundle after setup
Restore tested:              Sandbox: YES (dump→encrypt→decrypt→restore). Production data: NOT VERIFIED (first nightly run after merge)
Recovery procedure:          docs/infra/BACKUP_RESTORE.md
App rollback:                rollback-prod.yml (manual) + automatic on failed health checks
Snapshot:                    expires 2026-10-01 09:50 UTC — retake right before the release
```

## Final architecture (after merge + the manual steps above)

```text
                               GitHub aprodac/MERCON
          ┌──────────────────────────────┼─────────────────────────────────┐
     pull requests                 push dev / schedules              push main (via reviewed PR)
          │                              │                                 │
   GitHub-hosted runners          dev runner (label dev)          prod runner (label prod)
   ci.yml, release-check          82.29.167.128 — dev stack       org runner group: this repo +
   (reads ledger artifact,        DEV_* secrets only, logs kept    branch-pinned workflows only
    no server access)                                                   │
                                                  ┌─────────────────────┼──────────────────────┐
                                                  │ ci-cd.yml (main)    │ backup-db / prod-ledger
                                                  │ /opt/mercon/prod    │ / disk-guard (dev = default
                                                  │ backup→migrate→swap │   branch, scheduled)
                                                  │ health→auto-rollback│
                                                  ▼                     ▼
       Internet ──443/80──► nginx (host) ──► 127.0.0.1:3050 mercon-api ──► mercon-postgres (pgdata, 127.0.0.1:15432)
       (firewall: 22/80/443 only)        └─► 127.0.0.1:3060 mercon-frontend
                                            mercon-api ──► /var/lib/mercon/mercon-*uploads (persistent)
       Backups: /var/backups/mercon (7 d) ─► age-encrypted bundle (DB + uploads + key) ─► GitHub artifact (14 d)
                Hostinger weekly image (2) · snapshot before releases
       mesiri (separate product): Postgres 127.0.0.1:5432, Redis 127.0.0.1:6379
```
