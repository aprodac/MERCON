# Release process — dev → main (production)

Production (mercon.tech) only ever changes through a **release PR from `dev`
into `main`**. Day-to-day work goes to `dev` (auto-deployed to
dev.mercon.tech); a release is a PR that moves `main` forward to `dev`.

## Releasing

1. **Open the release PR**: base `main`, compare `dev`, title
   `Release YYYY-MM-DD`.
2. **Wait for two checks**
   - *Build, Typecheck & Validate Monorepo* (`ci.yml`)
   - *Release Check* (`release-check.yml`), which posts a **release report**
     comment on the PR and keeps it updated as `dev` changes:
     - what ships: commits, authors, files added/changed/deleted per area
     - database: which migrations will run on **production**, failed
       migrations, and any destructive SQL (DROP / TRUNCATE / DELETE / UPDATE /
       type change / rename) in the new migrations
3. **Read the report.**
   - ✅ *ready to merge* — nothing unusual.
   - ⚠️ *review needed* — e.g. destructive SQL: confirm with its author that it
     is intended.
   - 🚫 *blocked* — fix first (the check fails): production unreachable,
     failed migrations on production, missing migration ledger, or an
     already-released migration file was edited.
4. **Merge** (merge commit). This deploys production via `ci-cd.yml`:
   1. build the new images (live site untouched)
   2. **back up the production database** to
      `/var/backups/mercon/mercon-db-predeploy-<time>-<sha>.dump` — an empty
      or failed dump stops the deploy before anything changes
   3. `prisma migrate deploy` — if it fails, the old containers keep serving
   4. restart containers, then a health check (container health +
      `GET /health`)
5. **Watch the deploy** in Actions → *CI/CD Pipeline*. If it fails after the
   backup, the last step prints the exact restore command.
6. **Mobile apps**: after a successful deploy, build from `main` on
   Codemagic — `main` builds talk to `https://mercon.tech/api`
   (see `docs/CODEMAGIC_SETUP.md`).

## Rules

- Never push directly to `main`; always a PR from `dev`.
- Keep `main` an ancestor of `dev`. If something lands on `main` first (a
  hotfix), merge `main` back into `dev` before the next release — the report
  warns when this is needed.
- Never edit a migration that has already been released; add a new one.
- Migrations only reach production through `prisma migrate deploy` in
  `ci-cd.yml`. The API container does not change the schema on start.

## If a deploy goes wrong

- **Migration failed**: the live site still runs the previous version. Fix the
  migration on `dev` and release again; resolve the failed row with
  `prisma migrate resolve` if needed.
- **Broken after migration**: restore the pre-deploy backup (command printed in
  the failed run), then revert the release merge on `main` via a PR.
- Backups: `/var/backups/mercon/` on the server, kept 7 days (pre-deploy dumps
  and the nightly `backup-db.yml` dumps; nightly ones are also stored as
  GitHub artifacts for 14 days).

## Retired

`promote-dev-to-prod.yml` (checkpoint + Sentinel promotion) was removed on
2026-09-24: its Sentinel Doctor tool was never merged into `dev`/`main`, so it
blocked every promotion, and the copy on `main` did not run migrations. The
release PR flow above replaces it.
