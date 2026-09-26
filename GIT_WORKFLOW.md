# MERCON — Git Workflow & Branch Policy

## 1. Core Branch Rules

From now onwards, all development, agent workflows, pulls, and pushes must adhere strictly to the following branch policy:

1. **Dedicated Working Branch (`midlaj`)**:
   - All feature work, fixes, and local commits must be done on the `midlaj` branch.
   - Commits and pushes must **ONLY** target `origin/midlaj`.
   - Never push directly to `dev` or `main`.

2. **Syncing from `dev` (`dev` -> `midlaj` Rebase)**:
   - To stay up-to-date with team changes, always pull/fetch from `origin/dev`.
   - Rebase the `midlaj` branch on top of `origin/dev`:
     ```bash
     git checkout midlaj
     git fetch origin dev
     git rebase origin/dev
     ```
   - **Zero Loss / Preserve Everything**: During any rebase or conflict resolution, **NEVER** drop or overwrite existing work. Preserve all existing features, schema migrations, and components without removing anything.

3. **Pushing Changes**:
   - After building and verifying the code, push only to `midlaj`:
     ```bash
     git push origin midlaj
     # or if rebased on dev:
     git push --force-with-lease origin midlaj
     ```

---

## 2. Standard Daily Workflow

### Step 1: Switch to `midlaj`
```bash
# Create and switch to midlaj if not already on it
git checkout -B midlaj
```

### Step 2: Sync with latest `dev`
```bash
git fetch origin dev
git rebase origin/dev
```

### Step 3: Implement & Test
- Implement requested features/fixes.
- Run type checks and verification:
  - `cd backend/api-server && npx tsc --noEmit`
  - `cd frontend/web-dashboard && npx tsc -b`

### Step 4: Commit and Push to `midlaj` ONLY
```bash
git add .
git commit -m "feat/fix: <clear summary of changes>"
git push -u origin midlaj
```

---

## 3. Conflict Resolution & Integrity Safeguards

- **Never use `git merge -X theirs` blindly**: Inspect every conflict chunk.
- **Never drop Prisma migrations**: All migration folders inside `backend/api-server/prisma/migrations/` must be retained.
- **Preserve shared types**: Ensure `packages/shared-types` matches both frontend and backend requirements.
- **Always verify builds after rebase**: Run `tsc` checks on both frontend and backend before pushing to `origin/midlaj`.
