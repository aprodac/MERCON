# Moving dev to its own server

Production (mercon.tech) stays on **187.127.180.98**. The dev stack
(dev.mercon.tech) moves to **82.29.167.128**. Production is never stopped or
redeployed during the move; dev is unreachable for a few minutes around the
DNS switch.

## What moves

| Item | Old location (187.127.180.98) | How |
|---|---|---|
| Dev containers `dev-api`, `dev-frontend`, `dev-postgres` | Docker project `mercon-dev` | Rebuilt from git by the dev deploy on the new server |
| Dev database | `dev-postgres` volume | `pg_dump` → bundle → `pg_restore` |
| Dev uploads | `/tmp/dev-uploads`, `/var/lib/mercon/dev-uploads` | Bundle |
| Dev encryption key | `/etc/aprodac/clients/dev/secrets.env` | Bundle (never through GitHub) |
| dev.mercon.tech certificate + certbot account | `/etc/letsencrypt` | Bundle, renewed later on the new server |
| Nginx site | `nginx/dev-mercon-api.conf` (+ new `nginx/00-default-ssl-dev.conf`) | Installed by the dev deploy |
| Deploy runner | One runner for everything | New runner with **only** the label `dev` (no `self-hosted`, so production jobs can never land there); old one labelled `prod` |

GitHub secrets (`DEV_*`) do not change.

## Steps

Scripts are in `scripts/provision/`. Copy that folder to both servers first,
e.g. from a local checkout of `ilan`:
`scp scripts/provision/*.sh root@<server>:/root/`

1. **New server: setup** (installs Docker, nginx, certbot, swap, firewall, runner)
   - GitHub → repo → Settings → Actions → Runners → *New self-hosted runner* → copy the token from the `./config.sh` line.
   - On 82.29.167.128: `RUNNER_TOKEN=<token> bash /root/server-setup.sh dev`
   - Check GitHub shows the new runner **Idle** with label `dev`.
2. **Label the old runner `prod`**: GitHub → Settings → Actions → Runners →
   `srv1752379` → add label `prod`. Nothing changes on the server.
3. **Old server: export** — `bash /root/dev-move-export.sh`, then copy
   `/root/dev-move.tgz` to the new server (`scp`, directly or via your laptop).
4. **New server: prepare** — `bash /root/dev-move-import.sh prepare`
   (key, certificate, uploads; must happen before the first deploy, because
   nginx refuses a site whose certificate is missing).
5. **Merge the workflow PR into `dev`.** Its dev deploy now runs on the new
   server and builds a fresh, empty dev stack there. Production workflows keep
   running on the old server (`prod` label).
6. **New server: restore the data** — `bash /root/dev-move-import.sh restore-db`
7. **DNS**: point `dev.mercon.tech`, `www.dev.mercon.tech`,
   `api-dev.mercon.tech` and `dev-api.mercon.tech` (A records) at
   **82.29.167.128**. Wait until `dig +short dev.mercon.tech` shows the new IP,
   then open https://dev.mercon.tech and sign in.
8. **New server: certificate renewal check** — `certbot renew --dry-run`.
9. **Old server: retire dev** — `bash /root/dev-move-retire.sh`
   (refuses to run until DNS points elsewhere). It removes the dev containers
   and nginx site and keeps the dev volume, uploads and key for a week,
   printing the command to delete them.

## Rollback

Until step 9, the old dev stack is untouched: point DNS back at
187.127.180.98 and remove the `dev` label from the workflow (or the new
runner) to send dev deploys back.

## Workflows after the move

| Runs on `prod` (187.127.180.98) | Runs on `dev` (82.29.167.128) |
|---|---|
| `ci-cd.yml`, `backup-db.yml`, `release-check.yml` (production ledger), `seed-db.yml`, `demo-data.yml`, `db-inspect.yml` (prod job), `sync-dev-from-prod.yml` (export job) | `ci-cd-dev.yml`, `db-inspect.yml` (dev job), `sync-dev-from-prod.yml` (import job) |

`sync-dev-from-prod.yml` now hands the snapshot from the prod runner to the dev
runner as a 1-day workflow artifact. `sync-prod-from-dev.yml` was removed: it
could overwrite production with dev data, and the servers are separate now.
