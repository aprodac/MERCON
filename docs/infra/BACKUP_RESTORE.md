# Backups and restore — production (mercon.tech)

## What is backed up

| What | Where | How often | Kept | Protected by |
|---|---|---|---|---|
| Database dump (`pg_dump -Fc`) | VPS `/var/backups/mercon/` | nightly (`backup-db.yml`) + before every deploy (`ci-cd.yml`) | 7 days | the VPS itself only |
| **Encrypted bundle**: database dump + uploaded documents (`/var/lib/mercon/mercon-*uploads`) + the data encryption key (`/etc/aprodac/clients/mercon/secrets.env`) | GitHub Actions artifact `mercon-backup-<run id>` (off the VPS) | nightly | 14 days | `age` encryption to the owner's public key. GitHub never sees the plaintext |
| Whole VPS image | Hostinger weekly backups | weekly | 2 | Hostinger account |
| Whole VPS snapshot | Hostinger snapshot (one at a time) | by hand before risky changes | 24 h | Hostinger account |

Every nightly run also **restores its own dump** into a throwaway Postgres
container (no network, data on tmpfs, removed afterwards). The run fails if
the restored table or migration count differs from production. The run summary
shows the result.

Until `BACKUP_AGE_RECIPIENT` is set, the nightly artifact is the old one: the
database dump **unencrypted** and **without** uploads or the key, plus a
warning in the run.

## One-time setup: the backup key (owner)

Do this on your own computer, not the VPS.

```bash
# https://github.com/FiloSottile/age — brew install age / apt install age
age-keygen -o mercon-backup-key.txt
# prints: Public key: age1...
```

1. Keep `mercon-backup-key.txt` **offline and in two places** (password manager + an encrypted USB drive, for example). Without it the bundles cannot be opened. Anyone who has it can read the backups.
2. GitHub → repo → Settings → Secrets and variables → Actions → **Variables** → New repository variable: `BACKUP_AGE_RECIPIENT` = the `age1...` public key. (A variable, not a secret: the public key is not sensitive.)
3. Actions → **Backup Production Database** → Run workflow. Check that it has a `mercon-backup-…` artifact and "Restore test passed" in the summary.

If uploads grow past 1.5 GB, the bundle leaves them out and the run fails
with a message. At that point move uploads to real object storage (S3, B2 or
R2 with `restic`/`rclone`); GitHub artifact storage is not meant for that size.

## Restore

### Database only (the usual case)

On the VPS, from the newest local dump:

```bash
ls -lt /var/backups/mercon/ | head
docker cp /var/backups/mercon/<file>.dump mercon-postgres:/tmp/restore.dump
docker exec mercon-postgres pg_restore --clean --if-exists --no-owner --no-privileges \
  -U "$POSTGRES_USER" -d mercon_db /tmp/restore.dump
docker exec mercon-postgres rm /tmp/restore.dump
```

### From the encrypted bundle (VPS lost, or local dumps gone)

```bash
# 1. Download the artifact (Actions → run → Artifacts) and unzip it.
# 2. Decrypt and unpack on a trusted machine:
age -d -i mercon-backup-key.txt mercon-backup-*.tar.gz.age | tar -xzf - -C restore/
#    restore/var/backups/mercon/mercon-db-*.dump
#    restore/var/lib/mercon/mercon-app-uploads/   restore/var/lib/mercon/mercon-uploads/
#    restore/etc/aprodac/clients/mercon/secrets.env
# 3. On the (new) server, before the first deploy:
sudo install -d -m 700 /etc/aprodac/clients/mercon
sudo install -m 600 restore/etc/aprodac/clients/mercon/secrets.env /etc/aprodac/clients/mercon/
sudo rsync -a restore/var/lib/mercon/ /var/lib/mercon/ && sudo chown -R 1000:1000 /var/lib/mercon/mercon-*uploads
# 4. Deploy main (it creates an empty database), then restore the dump as above.
```

**Restore the encryption key before the first deploy.** Otherwise
`client-secrets.sh ensure` creates a *new* key, and every field encrypted
with the old one becomes unreadable.

### Rehearse it

Quarterly: restore the latest bundle on a scratch machine following the steps
above, open a few uploaded documents, and note the date here.

| Date | By | Result |
|---|---|---|
| 2026-09-30 | Claude (sandbox) | Bundle step, `age` decrypt, and `pg_restore` of the decrypted dump verified against a database built from the repo's migrations (31 tables / 64 migrations, identical). **Not yet run against real production data.** |
