# Forensic Investigation Report: Dev Branch Deployment ENOSPC Failure

**Target**: `dev` branch CI/CD pipeline on self-hosted VPS runner (`srv1752379`)  
**Incident**: `npm warn tar TAR_ENTRY_ERROR ENOSPC: no space left on device, write` during `docker compose -p mercon-dev build mercon-frontend`  
**Date**: 2026-09-09  
**Status**: Investigation Complete (Phase 1)

---

## 1. Current Disk Usage & Incident Baseline

From live deployment telemetry and runner logs:
```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        48G   47G  1.1G  98% /
```

- **Total Capacity**: 48 GB
- **Used Space**: 47 GB (98% full)
- **Available Free Space**: ~1.1 GB (critically low)

### Failure Point
During `docker compose -p mercon-dev build mercon-frontend`:
```text
#14 [build 6/10] RUN npm install --workspace=@mercon/shared-types --workspace=@mercon/web-dashboard --legacy-peer-deps --ignore-scripts --no-audit --no-fund && npm cache clean --force
#14 89.20 npm warn tar TAR_ENTRY_ERROR ENOSPC: no space left on device, write
#14 89.22 npm error A complete log of this run can be found in: /root/.npm/_logs/2026-09-09T05_09_58_640Z-debug-0.log
```
The npm installation step failed because unpacking `node_modules` while simultaneously downloading tarballs into `/root/.npm` requires ~1.5 GB to 2.2 GB of temporary storage, which exceeded the 1.1 GB available on `/dev/sda1`.

---

## 2. Largest Disk Consumers

Based on VPS inspection records (`vps_inspection_detailed.log`, `job_101711751452.log`, `vps_inspection_result.log`):

1. **Docker Root (`/var/lib/docker/`)**:
   - `/var/lib/docker/overlay2`: Contains storage layers for production images, dev images, base images (`node:20-alpine`, `node:22-alpine`, `postgres:15-alpine`, `postgres:16-alpine`, `nginx:alpine`, `redis:7-alpine`), and BuildKit build cache.
   - `/var/lib/docker/containers/`: Contains active and historical JSON logs (`*-json.log`) for all containers across dev, production, and other services.
2. **Active System Logs (`/var/log/`)**:
   - `/var/log/syslog`: Continuously appended to by `rsyslog`. Because the `dev-api` container was previously crash-looping every 29 seconds (due to Prisma schema migration errors), thousands of error traces were written to `syslog`.
   - `/var/log/journal/`: Systemd journal logs.
   - `/var/log/auth.log`, `/var/log/daemon.log`, `/var/log/nginx/`.
3. **GitHub Actions Runner Directory (`actions-runner/`)**:
   - Located at `/root/actions-runner/` (runner executes as `root` `uid=0(root) gid=0(root)`).
   - `/root/actions-runner/_diag/`: Accumulates unbounded diagnostic logs (`Runner_*.log`, `Worker_*.log`) from every workflow run.
   - `/root/actions-runner/_work/_temp/`: Accumulates step scripts and environment files from every workflow execution.
4. **Build Context Transmission**:
   - Every Docker build currently transfers **32.32 MB** of context (`#7 transferring context: 32.32MB 0.6s done`) because `.dockerignore` did not exclude `docs/` (containing a 26 MB UI kit PDF), `image/`, `Trucks Docs (1)/`, etc.

---

## 3. Exact Reason Docker Prune Reclaimed 0 Bytes

During workflow execution:
```text
Pruning Docker build cache and unused images...
Total: 0B
Total: 0B
Total reclaimed space: 0B
Total reclaimed space: 0B
```

### Why it happened:
1. **Dev containers were still running**:
   - Neither `Free Disk Space (Pre-checkout)` nor `Rebuilding dev backend and frontend services...` in `.github/workflows/ci-cd-dev.yml` called `docker compose -p mercon-dev down`.
   - The containers `dev-api` and `dev-frontend` were in `Up` or `Restarting` states.
   - Docker rules strictly forbid `docker image prune -af` or `docker system prune -af` from deleting images that are referenced by any existing (running or paused) container.
   - Consequently, the old ~1.5 GB `mercon-dev-mercon-api` and ~100 MB `mercon-dev-mercon-frontend` images could not be reclaimed.
2. **Wildcard log truncation failed**:
   - The command `sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log 2>/dev/null` was executed in a subshell. When shell globbing runs before `sudo` or fails to match nested container paths, the command fails silently (`2>/dev/null`) and truncates 0 bytes.
3. **Log deletion command missed active logs**:
   - `sudo rm -rf /var/log/*.gz /var/log/*.[0-9] /var/log/*.old` only targets rotated archives. The active uncompressed `/var/log/syslog` and `/var/log/auth.log` files remained completely untouched. Furthermore, deleting an active log file with `rm` does not release disk space if the logging process retains an open file descriptor.

---

## 4. Exact Compose Projects and Containers Involved

### A. Development (Target Environment — ONLY this stack may be modified/stopped):
- **Compose Project Name**: `mercon-dev` (invoked with `-p mercon-dev`)
- **Containers**:
  - `dev-api` (Image: `mercon-dev-mercon-api:latest`)
  - `dev-frontend` (Image: `mercon-dev-mercon-frontend:latest`)
  - `dev-postgres` (Image: `postgres:15-alpine`, Port: `127.0.0.1:15433->5432`)
- **Volumes**:
  - `mercon-dev_pgdata` (Persistent PostgreSQL database for dev — **MUST NEVER BE DELETED**)
  - `/tmp/dev-uploads`, `/tmp/mercon-dev-tmp-uploads` (Host upload directories)

### B. Production & Host Services (STRICTLY UNTOUCHABLE — DO NOT TOUCH):
- **Compose Project Name**: `mercon` (default)
- **Containers**:
  - `mercon-api` (Image: `mercon-mercon-api:latest`, Port: `3050->3000`)
  - `mercon-frontend` (Image: `mercon-mercon-frontend:latest`, Port: `3060->80`)
  - `mercon-postgres` (Image: `postgres:15-alpine`, Port: `127.0.0.1:15432->5432`)
  - `mesiri-redis` (Image: `redis:7-alpine`, Port: `127.0.0.1:6379->6379`)
  - `mesiri-postgres` (Image: `postgres:16-alpine`, Port: `5432->5432`)
- **Volumes**:
  - `mercon_pgdata` (Production database volume)
  - `/tmp/mercon-uploads`, `/tmp/uploads` (Production uploads)

---

## 5. Log Locations and Sizes

- **System Logs**: `/var/log/`
  - Critical active files: `/var/log/syslog`, `/var/log/auth.log`, `/var/log/daemon.log`, `/var/log/kern.log`, `/var/log/nginx/`
- **Systemd Journal**: `/var/log/journal/` or `/run/log/journal/` (managed via `journalctl`)
- **Docker Container Logs**: `/var/lib/docker/containers/<container-id>/<container-id>-json.log`
- **Runner Logs**:
  - `/root/actions-runner/_diag/` (`Runner_*.log`, `Worker_*.log`)
  - `/root/actions-runner/_work/_temp/` (Transitory build scripts and step outputs)

---

## 6. Current Workflow Cleanup Order and Flaws

In `.github/workflows/ci-cd-dev.yml` (commit `2306b22c`):

1. **Step 1 (`Free Disk Space`)**:
   - Runs `journalctl --vacuum-size=50M`
   - Runs `rm -rf /var/log/*.gz ...` (Misses active uncompressed logs)
   - Runs `docker builder prune`, `docker image prune -af`, `docker system prune -af` **without stopping dev containers**.
   - Result: 0B reclaimed.
2. **Step 2 (`Checkout Code`)**:
   - Native git checkout.
3. **Step 3 (`Rebuild and Restart Dev Docker Containers`)**:
   - Prunes again without stopping dev containers (0B reclaimed).
   - Builds `mercon-api` first:
     - Creates new `mercon-dev-mercon-api` image (~1.5 GB).
     - Keeps the old `mercon-dev-mercon-api` image on disk (locked by running `dev-api` container).
     - Build cache pruned (504 MB reclaimed).
     - Net available space: still ~1.1 GB.
   - Builds `mercon-frontend` second:
     - `npm install` runs in `/app`.
     - Fails with `ENOSPC: no space left on device, write`.

---

## 7. Frontend Dockerfile & Dependency Analysis

In `frontend/web-dashboard/Dockerfile`:
```dockerfile
COPY package.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY frontend/web-dashboard/package.json ./frontend/web-dashboard/
RUN npm install --workspace=@mercon/shared-types --workspace=@mercon/web-dashboard --legacy-peer-deps --ignore-scripts --no-audit --no-fund && npm cache clean --force
```

- **Dependencies required for `tsc -b && vite build`**:
  - UI libraries: React 19, Radix UI, Tailwind 4, Lucide, Recharts, Framer Motion, Leaflet, ExcelJS, JSPDF.
  - Build tools: TypeScript 6, Vite 8, `@vitejs/plugin-react`, `@types/*`.
- **Dependencies that can be safely excluded**:
  - `oxlint: ^1.71.0` in `frontend/web-dashboard/package.json`: This is a Rust-based linter binary for `npm run lint`. It is never executed during production container builds (`tsc -b && vite build`).
  - Monorepo root `devDependencies` in `package.json`: `concurrently` (which produces engine warnings on Node 20/22) and `localtunnel`. These are developer-only conveniences for local testing and have zero utility in Docker images.
  - Temporary download cache: `/root/.npm` must be removed within the same layer command.

---

## 8. Proposed Safe Changes

### Step 1: Safe Pre-Build Cleanup in `ci-cd-dev.yml`
1. Stop dev containers explicitly before any pruning:
   ```bash
   docker compose -p mercon-dev down || true
   ```
2. Truncate active system logs safely:
   ```bash
   sudo find /var/log -type f -name "*.log" -exec truncate -s 0 {} + 2>/dev/null || true
   sudo find /var/log -type f \( -name "*.gz" -o -name "*.[0-9]" -o -name "*.old" \) -delete 2>/dev/null || true
   sudo truncate -s 0 /var/log/syslog /var/log/messages /var/log/kern.log /var/log/auth.log /var/log/daemon.log /var/log/mail.log 2>/dev/null || true
   sudo journalctl --vacuum-time=1d 2>/dev/null || sudo journalctl --vacuum-size=20M 2>/dev/null || true
   ```
3. Truncate container JSON logs safely:
   ```bash
   sudo find /var/lib/docker/containers/ -type f -name "*-json.log" -exec truncate -s 0 {} + 2>/dev/null || true
   ```
4. Purge runner transient diagnostics and temporary files:
   ```bash
   sudo find / -maxdepth 4 -path "*/actions-runner/_diag/*" -type f -delete 2>/dev/null || true
   sudo find / -maxdepth 4 -path "*/actions-runner/_work/_temp/*" -type f -delete 2>/dev/null || true
   ```
5. Prune APT archives:
   ```bash
   sudo apt-get clean 2>/dev/null || true
   ```
6. Prune Docker build cache and unlocked dev images:
   ```bash
   sudo docker builder prune -af 2>/dev/null || true
   sudo docker buildx prune -af 2>/dev/null || true
   sudo docker image prune -af 2>/dev/null || true
   sudo docker system prune -af 2>/dev/null || true
   ```
   *(Note: Never run with `--volumes` or `volume prune`)*.

### Step 2: Inverted Build Order & Staged Pruning
1. Build `mercon-frontend` **first**:
   - Generates the lightweight static Nginx image (~50 MB).
2. Immediately prune the Node build stage cache:
   ```bash
   sudo docker builder prune -af 2>/dev/null || true
   ```
   This releases the multi-stage compilation layers before the API image is built.
3. Build `mercon-api` **second** with ample remaining free space.
4. Launch containers:
   ```bash
   docker compose -p mercon-dev up -d
   ```

### Step 3: Optimize Build Context via `.dockerignore`
Exclude bulky non-build assets:
```text
docs/
image/
Trucks Docs (1)/
*.pdf
*.apk
*.zip
*.tar*
```
Reduces context upload from 32.32 MB to < 1 MB.

### Step 4: Optimize `frontend/web-dashboard/Dockerfile`
- Strip `concurrently`, `localtunnel`, and `oxlint` prior to running `npm install`.
- Ensure npm cache is wiped within the same layer.

---

## 9. Production Safety Verification

| Resource | Safety Measure |
| :--- | :--- |
| **Production Containers** (`mercon-api`, `mercon-frontend`, `mercon-postgres`) | Workflow specifies `-p mercon-dev`; production is never referenced, stopped, or restarted. |
| **Production Volumes** (`mercon_pgdata`, `/tmp/mercon-uploads`) | No volume prune flags (`--volumes`) are executed; only dev uploads (`/tmp/dev-uploads`) are touched. |
| **Dev Database** (`mercon-dev_pgdata`) | Volumes are explicitly preserved. Compose down only removes containers and networks, preserving named volumes. |
| **Shared Services** (`mesiri-redis`, `mesiri-postgres`) | Unaffected. Protected because they are running containers not associated with the `mercon-dev` project. |

---

## 10. Items of Uncertainty / Special Notes
- The self-hosted runner process is managed under `/root/actions-runner`.
- If the VPS host has other non-Docker services generating syslog messages, truncating `/var/log/syslog` safely frees storage without stopping the syslog daemon.
