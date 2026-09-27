# Client secrets (per-server keys)

Each client deployment keeps its own secrets on its own server. They are never
in git and never in GitHub secrets, so adding a client never means adding
repository secrets, and one client's keys are never stored alongside another's.

| What | Where |
|---|---|
| Secrets file | `/etc/aprodac/clients/<client>/secrets.env` (directory `700`, file `600`, owned by root) |
| Managed by | `scripts/provision/client-secrets.sh` |
| Used by | the deploy workflows (`ci-cd.yml` for `mercon`, `ci-cd-dev.yml` for `dev`), which pass the values to the API container |

`<client>` is the deployment's `CLIENT_NAME` (`mercon`, `dev`, …).

## What's in it today

| Variable | Purpose |
|---|---|
| `DATA_ENCRYPTION_KEY` | Encrypts stored integration secrets (AES-256-GCM): the ZATCA certificate private key and ZATCA API secrets. Future integrations that store credentials use the same key. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | Only during a rotation: older keys, comma-separated, used for decryption only. |

The other deployment secrets (database password, JWT secret, admin seed
password) still come from GitHub secrets. Moving them here is part of the
new-client setup script (platform plan, Phase 4).

## New client / first deploy

Nothing to do by hand. Every deploy runs:

```bash
sudo bash scripts/provision/client-secrets.sh ensure <client>
```

On the first deploy this creates the file and a random key
(`openssl rand -base64 32`). On later deploys it only checks the key. It never
replaces an existing key. A missing or malformed key stops the deploy before
anything is built or restarted.

**Then back the key up once**, off the server, separately from database
backups (a database backup without the key can't reveal the secrets in it,
which is the point):

```bash
sudo bash scripts/provision/client-secrets.sh show <client>
```

Store it in the team password manager as `Aprodac / <client> / DATA_ENCRYPTION_KEY`.
The deploy log prints the key's id (for example `id 1e20a915`), never the key. Use
`fingerprint` to check that a stored copy matches:

```bash
sudo bash scripts/provision/client-secrets.sh fingerprint <client>
```

## Rotating the key

1. `sudo bash scripts/provision/client-secrets.sh rotate <client>`: makes a new
   key; the old one becomes `DATA_ENCRYPTION_KEY_PREVIOUS`.
2. Back up the new key (`show`).
3. Redeploy. On startup the API re-encrypts every stored secret with the new key
   and logs `Re-encrypted stored secrets with the current key`.
4. `sudo bash scripts/provision/client-secrets.sh finish-rotation <client>`
   removes the old key.

Nothing has to reconnect, and ZATCA keeps working throughout.

## Moving a client to a new server

Copy `/etc/aprodac/clients/<client>/secrets.env` along with the database and
uploads (or restore the key from the password manager into a new file with
the same name). Keep permissions `600`.

## If a key is lost

No data is lost. Only the stored integration credentials become unreadable:
the API logs it at startup, and the ZATCA settings page says the certificate
can't be used. Fix: **Settings → ZATCA e-invoicing → Reset connection**, then
connect again with a new OTP from Fatoora (about 5 minutes). Invoices already
sent to ZATCA stay valid.

## Later: a secrets manager

At SaaS scale the key moves to a secrets manager (Vault / Infisical / a cloud
KMS). Only where the key is loaded from changes (`secretBox.ts` reads
`DATA_ENCRYPTION_KEY`); the encrypted data format and rotation stay the same.
