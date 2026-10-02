# Production runner and network hardening — manual steps

These need a GitHub **org/repo admin** or **SSH to the VPS (187.127.180.98)**.
They could not be done from the Claude session that wrote this: it had no SSH
and no GitHub admin API.

## 1. Who can put a job on the production runner (most important)

Any workflow file that says `runs-on: [self-hosted, prod]` runs as root on
production (the runner uses `sudo` and Docker, and Docker access alone is
root-equivalent). The repo no longer has such a job on pull requests, but
anyone with write access can still:

- push a branch containing a *new* workflow that targets `[self-hosted, prod]`, or
- dispatch an existing manual workflow (`db-inspect`, `seed-db`, …) **on their own branch**, where the file can say anything.

Workflow files cannot prevent this. GitHub settings can:

| # | Where | Set |
|---|---|---|
| 1 | Repo → Settings → Rules → Rulesets (or Branches) | Rules for `main` **and** `dev`: require a pull request with ≥1 approving review; block force pushes and deletions; restrict who can push. |
| 2 | Org → Settings → Actions → Runner groups → **New runner group** `production` | Repository access: **only `aprodac/MERCON`**. If your plan shows **Workflow access → Selected workflows**, allow only: `aprodac/MERCON/.github/workflows/ci-cd.yml@refs/heads/main`, `rollback-prod.yml@refs/heads/main`, `backup-db.yml@refs/heads/dev`, `prod-ledger.yml@refs/heads/dev`, `disk-guard.yml@refs/heads/dev`, and the manual ones you still use (`db-inspect.yml`, `seed-db.yml`, `demo-data.yml`, `sync-dev-from-prod.yml`) at `@refs/heads/main`. Scheduled and `workflow_run` jobs run from the default branch (`dev`), hence `@refs/heads/dev` for those. Branch-pinned entries are what stop "dispatch on my own branch". |
| 3 | Move the runner into that group | The runner is currently registered to the **repository** (docs/SERVER_MOVE_DEV.md), and repository runners cannot be grouped. Re-register it at **org** level: org → Settings → Actions → Runners → New runner (token), then on the VPS `cd /root/actions-runner && ./svc.sh stop && ./config.sh remove --token <repo-removal-token> && ./config.sh --url https://github.com/aprodac --token <org-token> --labels prod --runnergroup production --unattended && ./svc.sh install && ./svc.sh start`. Keep the label `prod`. |
| 4 | Repo → Settings → Actions → General | "Fork pull request workflows": require approval for all outside collaborators. Workflow permissions: **Read repository contents** by default. |
| 5 | Repo → Settings → Environments → `production` | Deployment branches: `main` only. Then move `JWT_SECRET`, `POSTGRES_*`, `SEED_ADMIN_PASSWORD`, `GEMINI_*`, `ICCES_*`, `VITE_GOOGLE_MAPS_API_KEY` from repository secrets into this environment and add `environment: production` to the `ci-cd.yml` and `rollback-prod.yml` jobs. Until then **every workflow on every branch can read the production secrets**, including ones on GitHub-hosted runners. (Not done in code: jobs that also run from `dev` — backups, ledger — would need their own read-only secrets first.) |

If "Selected workflows" is not offered on your plan, #1 + #3 (org group limited
to this repo) + #5 are the available controls. The stronger fix then is
architectural: build images on GitHub-hosted runners, push them to GHCR, and
have the VPS pull them (no runner on production at all).

**Verify:** from a throwaway branch, add a workflow with
`runs-on: [self-hosted, prod]` and `run: id`; the job must stay *queued*
("waiting for a runner") and never run. Delete the branch afterwards.

## 2. Run the runner as a non-root user (needs SSH)

Be honest about the gain: the runner needs Docker, and **membership of the
`docker` group is root-equivalent** (`docker run -v /:/host …`). A dedicated
user mainly stops *accidental* damage and makes `sudo` use explicit. The
protection against a hostile job is section 1.

Order matters: keep root SSH open in a second terminal the whole time. Don't
remove the old service until a manual dispatch works on the new one.

```bash
# 0. Inspect
ps -o user=,pid=,cmd= -p "$(pgrep -f Runner.Listener)"
systemctl list-units 'actions.runner.*'
sudo -l -U "$(ps -o user= -p "$(pgrep -f Runner.Listener)")" 2>/dev/null

# 1. User
sudo useradd -m -s /bin/bash mercon-runner
sudo usermod -aG docker mercon-runner

# 2. Root-owned helpers so sudo can be limited to fixed paths (a job can't
#    edit these; they are refreshed by an admin, not by the pipeline)
sudo install -d -m 755 /usr/local/lib/mercon
sudo install -m 755 -o root -g root /opt/mercon/prod/scripts/provision/client-secrets.sh /usr/local/lib/mercon/
sudo install -m 755 -o root -g root /opt/mercon/prod/scripts/provision/migrate-uploads.sh /usr/local/lib/mercon/

# 3. Sudoers allow-list (validate with visudo -c before relying on it)
sudo tee /etc/sudoers.d/mercon-runner >/dev/null <<'EOF'
Cmnd_Alias MERCON_NGINX = /usr/sbin/nginx -t, /usr/bin/systemctl reload nginx, \
  /usr/bin/cp nginx/mercon-api.conf /etc/nginx/sites-available/mercon-api.conf, \
  /usr/bin/cp nginx/00-default-ssl.conf /etc/nginx/sites-available/00-default-ssl.conf, \
  /usr/bin/ln -sf /etc/nginx/sites-available/* /etc/nginx/sites-enabled/*
Cmnd_Alias MERCON_OPS = /usr/local/lib/mercon/client-secrets.sh *, \
  /usr/local/lib/mercon/migrate-uploads.sh *, \
  /usr/bin/install -d -m 755 -o mercon-runner -g mercon-runner /opt/mercon/prod, \
  /usr/bin/mkdir -p /var/backups/mercon, /usr/bin/chown mercon-runner /var/backups/mercon
mercon-runner ALL=(root) NOPASSWD: MERCON_NGINX, MERCON_OPS
EOF
sudo chmod 440 /etc/sudoers.d/mercon-runner && sudo visudo -c

# 4. Move ownership of what the runner writes
sudo chown -R mercon-runner: /opt/mercon/prod /var/backups/mercon

# 5. Reinstall the runner service as that user (same registration)
cd /root/actions-runner && sudo ./svc.sh stop && sudo ./svc.sh uninstall
sudo mv /root/actions-runner /home/mercon-runner/ && sudo chown -R mercon-runner: /home/mercon-runner/actions-runner
cd /home/mercon-runner/actions-runner && sudo ./svc.sh install mercon-runner && sudo ./svc.sh start

# 6. Test before the next release: Actions → Disk Guard → Run workflow, then
#    Production Migration Ledger → Run workflow; both must pass.
```

The workflows still call `sudo bash scripts/provision/…` from the checkout.
After step 3 those calls are refused (by design) until the workflows switch to
`sudo /usr/local/lib/mercon/<script>`. That switch is a one-line change per
call. Do it in the same PR that you merge right after this runbook, so the
next deploy doesn't fail.

**Rollback:** `sudo ./svc.sh uninstall` in the new location, move the
directory back to `/root/actions-runner`, then `sudo ./svc.sh install root && sudo ./svc.sh start`.

## 3. Public ports and mesiri's Postgres (needs SSH + mesiri owner)

Known from the Hostinger API (2026-09-30):
- `mesiri-postgres` publishes **0.0.0.0:5432 and [::]:5432** with the compose file's **default password**. mesiri's own env connects via `localhost:5432`, so the app does not need the public binding.
- No Hostinger firewall exists. Docker-published ports bypass UFW.
- After the MERCON release, 3050/3060 bind to 127.0.0.1 (this branch).

Nothing here proves 5432 is reachable from the internet (this session could
not open raw TCP). Check first:

```bash
# From a machine OUTSIDE the VPS:
nc -vz -w5 187.127.180.98 5432        # "succeeded" = public
# On the VPS: who is connected, and from where
sudo ss -tnp state established '( sport = :5432 )'
docker exec mesiri-postgres psql -U mesiri -d mesiri -Atc \
  "select client_addr, usename, count(*) from pg_stat_activity where client_addr is not null group by 1,2"
sudo ss -tlnp        # full list of listening ports, for the firewall below
```

If every client is `127.0.0.1`, `::1` or a Docker bridge address (`172.x`):

1. **mesiri, minimal change:** in `/opt/mesiri/docker-compose.yml` change
   the postgres ports line to
   `"127.0.0.1:${MESIRI_POSTGRES__PORT:-5432}:5432"`. Do **not** put the IP
   into `MESIRI_POSTGRES__PORT` itself: mesiri's app reads that variable as
   its connection port. Then `cd /opt/mesiri && docker compose up -d postgres`.
   mesiri's Postgres restarts once and the volume is kept. Also change its
   password from the compose default, and rotate the third-party API keys
   that sit in plain text in its hPanel environment.
2. **Hostinger firewall (defence in depth):** create a firewall with
   accept rules for **TCP 22** (or the real SSH port from `sshd -T | grep ^port`),
   **TCP 80** and **TCP 443** from any. Add any other port `ss -tlnp` shows
   is used externally (e.g. a mesiri webhook port not behind nginx).
   Activate it on VM 1752379. Everything else is then dropped. Keep an
   hPanel browser console open while activating, in case SSH is cut.

**Verify:** from outside, `nc -vz 187.127.180.98 5432`, `:3050` and `:3060`
all fail; `https://mercon.tech/api/health` still 200; mesiri still works.
