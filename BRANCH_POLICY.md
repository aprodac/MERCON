# MERCON — Strict Git Branch & Push Policy

> **CRITICAL RULE**: ALL commits, code updates, and git pushes in this repository—whether performed by AI Agents (Antigravity, Claude, Cursor, GitHub Copilot), IDE automated tools, or developers—MUST target the **`hysam`** branch (`origin/hysam` / local `HYSAM`).

---

## 1. Primary Mandate

- **Strict Target Branch**: `hysam` (Remote: `origin/hysam`, Local: `HYSAM` / `hysam`)
- **Prohibited Target Branches**: Never push directly to `main`, `dev`, or any secondary branches unless explicitly directed by the repository owner.

---

## 2. Rules for AI Agents & IDE Integrations

Every AI assistant or automated agent working on this codebase MUST follow these instructions without exception:

1. **Branch Verification Before Push**:
   Always verify the current active branch before committing or pushing:
   ```bash
   git branch
   ```
   If not on the `hysam` (`HYSAM`) branch, switch to it immediately:
   ```bash
   git checkout HYSAM
   ```

2. **Explicit Push Command**:
   When executing a git push, explicitly specify `hysam` as the remote target branch:
   ```bash
   git push origin HYSAM:hysam
   ```
   Or set upstream tracking once:
   ```bash
   git push -u origin HYSAM:hysam
   ```

3. **Pre-Push Quality & Build Verification**:
   Before pushing any commits to `origin/hysam`, run both mandatory TypeScript verification commands:
   - Backend API Server: `cd backend/api-server && npx tsc --noEmit`
   - Frontend Web Dashboard: `cd frontend/web-dashboard && npx tsc -b`

4. **Pulling & Merging Updates**:
   To keep `hysam` up to date with upstream changes from `dev` or `main`:
   ```bash
   git fetch --all
   git merge origin/dev -m "merge: sync latest dev updates into hysam"
   ```

---

## 3. Recommended Local Git Settings

To enforce `hysam` as the default target branch for local pushes, configure git locally in this repository:

```bash
# Set upstream tracking for HYSAM branch
git checkout HYSAM
git branch --set-upstream-to=origin/hysam HYSAM

# Ensure default push behavior pushes current branch to tracking remote
git config push.default current
```
