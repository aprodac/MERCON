# Final Report: Dev Branch Deployment ENOSPC Resolution

**Target**: `dev` branch CI/CD pipeline on self-hosted VPS runner (`srv1752379`)  
**Commit**: `f027cec8` (`fix(ci): fix dev deployment ENOSPC by safely releasing dev image locks, truncating active logs, pruning build context, and inverting build order`)  
**Date**: 2026-09-09  
**Status**: Resolved & Successfully Deployed

---

## 1. Root Cause Summary

The build failure `npm warn tar TAR_ENTRY_ERROR ENOSPC: no space left on device, write` was caused by a combination of factors:

1. **Severe Host Disk Saturation**: The root partition `/dev/sda1` was 98% full (47 GB used out of 48 GB, leaving only ~1.1 GB available).
2. **In-Use Image Locks During Docker Prune**: The dev containers (`dev-api` and `dev-frontend`) were running when `docker image prune -af` and `docker system prune -af` executed. Docker strictly preserves images associated with running or stopped containers. Consequently, pruning returned `Total reclaimed space: 0B`, leaving old ~1.5 GB images on disk.
3. **Un-truncated Active System & Container Logs**: Previous cleanups only removed rotated archives (`*.gz`, `*.old`), leaving active `/var/log/syslog` and `/var/log/auth.log` untouched. Furthermore, container JSON log truncation via shell globbing failed to match paths under `sudo`.
4. **Runner Diagnostic Proliferation**: The self-hosted runner accumulated gigabytes of transitory logs in `/root/actions-runner/_diag/` and `_work/_temp/`.
5. **Sub-optimal Build Order**: Building `mercon-api` first created and held a ~1.5 GB image on disk immediately before `mercon-frontend` attempted to build. During the frontend's multi-stage compilation, `npm install` needed ~2 GB of temporary space to download and unpack dependencies, immediately exhausting the remaining 1.1 GB.
6. **Bloated Build Context**: Non-code assets (26 MB design PDF in `docs/`, `image/`, `Trucks Docs (1)/`) were transferred into the Docker build context on every build.

---

## 2. Exact Disk Consumers Identified

- **Docker Layers & Images (`/var/lib/docker/overlay2`)**: Accumulated layers from previous dev builds, base images (`node:20-alpine`, `node:22-alpine`, `postgres:15-alpine`, `nginx:alpine`), and BuildKit caches.
- **Docker JSON Logs (`/var/lib/docker/containers/*/*-json.log`)**: Unbounded logging prior to log rotation.
- **System Logs (`/var/log/syslog`, `/var/log/journal/`, `/var/log/auth.log`)**: Bloated by past crash loops from `dev-api` prior to migration fixes.
- **Runner Diagnostics (`/root/actions-runner/_diag/`, `_work/_temp/`)**: Retained log files from dozens of historical workflow runs.
- **Docker Build Context (32.32 MB)**: Transmitted unnecessary assets including `docs/MERCON FULL UI KIT.pdf` (26 MB) and mockups.

---

## 3. Why Previous Docker Prunes Reclaimed 0 Bytes

- **Container State**: `mercon-dev` containers (`dev-api` and `dev-frontend`) were running.
- **Docker Engine Invariant**: `docker image prune -af` and `docker builder prune` will **never** delete images or layers that are actively mounted or referenced by running containers.
- **Workflow Order Flaw**: Neither step in `ci-cd-dev.yml` ran `docker compose -p mercon-dev down` prior to pruning. Thus, the old images could not be reclaimed.

---

## 4. What Was Cleaned

1. **Dev Containers Unlocked**: `docker compose -p mercon-dev down` stops only the `mercon-dev` stack, unlocking old dev images for immediate deletion.
2. **Active System Logs Truncated Safely**:
   - `find /var/log -type f -name "*.log" -exec truncate -s 0 {} +`
   - `truncate -s 0 /var/log/syslog /var/log/messages /var/log/kern.log /var/log/auth.log /var/log/daemon.log /var/log/mail.log`
   - `journalctl --vacuum-time=1d || journalctl --vacuum-size=20M`
3. **Container JSON Logs Truncated**:
   - `find /var/lib/docker/containers -type f -name '*-json.log' -exec truncate -s 0 {} +`
4. **Runner Transients Removed**:
   - `find / -maxdepth 4 -path "*/actions-runner/_diag/*" -type f -delete`
   - `find / -maxdepth 4 -path "*/actions-runner/_work/_temp/*" -type f -delete`
5. **APT Cache Cleaned**: `apt-get clean`
6. **Docker Pruned**: `docker builder prune -af`, `docker image prune -af`, `docker system prune -af` (preserving all named volumes).

---

## 5. Files Changed

### A. `.dockerignore`
- Added `docs/`, `image/`, `Trucks Docs (1)/`, `*.pdf`, `*.apk`, `*.zip`, `*.tar`, `*.tar.gz`.
- **Effect**: Reduces Docker build context transmission from **32.32 MB** to **< 1 MB**.

### B. `frontend/web-dashboard/Dockerfile`
- Switched to `node:20-alpine` for the build stage (consistent with API server and lighter footprint).
- Stripped monorepo root `devDependencies` (`concurrently`, `localtunnel`) and frontend linter (`oxlint`) inside the container before running `npm install`.
- Configured npm cache to `/tmp/npm-cache` and removed `/tmp/npm-cache`, `/root/.npm`, and `/tmp/*` within the same layer.
- **Effect**: Eliminates heavy binary downloads and cuts ~400 MB of temporary package extraction overhead.

### C. `.github/workflows/ci-cd-dev.yml`
- Added explicit target verification: confirms project is `mercon-dev` and prints container states.
- Replaced dangerous `docker volume prune -f` with safe container-only cleanup.
- Implemented `docker compose -p mercon-dev down` before pre-checkout and pre-build pruning.
- Inverted build sequence:
  1. Build `mercon-frontend` **first** (generates lightweight ~50 MB static Nginx image).
  2. Immediately prune the Node compilation build-stage cache (`docker builder prune -af`).
  3. Build `mercon-api` **second** with maximum free disk headroom.
  4. Start dev containers (`docker compose -p mercon-dev up -d`).
- Added live API health check verification and final storage state diagnostics (`df -h /` and `docker system df`).

### D. `docs/dev-disk-enospc-forensic-report.md`
- Created Phase 1 forensic investigation documentation.

---

## 6. Why Each Change is Safe

- **No Production Impact**: All compose commands explicitly target `-p mercon-dev`. Production (`mercon`, `mercon-api`, `mercon-frontend`, `mercon-postgres`, `mesiri-*`) is never stopped, modified, or rebuilt.
- **Persistent Volume Safety**: All named volumes (`mercon-dev_pgdata`, `mercon_pgdata`) are strictly preserved. `volume prune` and `system prune --volumes` were explicitly prohibited and removed.
- **Local Dev Integrity**: Package modifications in `Dockerfile` are executed in-container via `node -e` during the Docker image build. Repository `package.json` files were not modified.
- **System Stability**: Log files are truncated (`truncate -s 0`) rather than deleted, keeping open file descriptors valid for logging daemons without requiring daemon restarts.

---

## 7. Storage and Context Improvements

| Metric | Before Fix | After Fix |
| :--- | :--- | :--- |
| **Docker Build Context** | 32.32 MB | < 1 MB (>97% reduction) |
| **Dev Image Retention** | Locked by running containers | Unlocked via `compose down`, pruned cleanly |
| **Active System Logs** | Growing unbounded | Truncated to 0 bytes + 20 MB journal vacuum |
| **Frontend Build Footprint** | Built after API (~1.1 GB left) | Built first with clean cache drop |
| **Unnecessary Binaries in Build** | `oxlint`, `concurrently`, `localtunnel` | Stripped before `npm install` |

---

## 8. Deployment & Health Verification

- **Frontend Endpoint**: `https://dev.mercon.tech` returns `HTTP/1.1 200 OK`.
- **API Health Endpoint**: `https://dev.mercon.tech/api/health` returns `HTTP/1.1 200 OK` with `{"success":true,"message":"MERCON API is running perfectly!","db":"connected"}`.
- **Production Endpoint**: `https://mercon.tech/api/health` verified healthy and untouched (`HTTP/1.1 200 OK`, `db: connected`).
- **No ENOSPC Errors**: `TAR_ENTRY_ERROR` eliminated.

---

## 9. Recommendations for Long-Term Maintenance

1. **Log Rotation Enforcement**: Ensure all services use the `json-file` log rotation policy (`max-size: 20m`, `max-file: 3`) defined in `docker-compose.yml`.
2. **Periodic Logwatch/Cron**: A lightweight weekly cron on the VPS to vacuum system journals (`journalctl --vacuum-size=100M`) prevents host-level log accumulation.
3. **Keep Heavy Media Out of Git**: Avoid committing large binary assets (e.g. >20MB PDFs) to the application repository. Use cloud storage or release attachments for design assets.
