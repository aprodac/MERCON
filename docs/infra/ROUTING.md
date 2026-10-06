# Road routing (OSRM) — real road ETAs, self-hosted

Every ETA and route line (Fleet map, driver app navigation, create-trip
schedule, customer tracking) comes from one place:
`backend/api-server/src/services/routing/routeProvider.ts`.

| Setting | Where | What |
|---|---|---|
| `OSRM_BASE_URL` | `ci-cd.yml` → `docker-compose.yml` (API env) | Production: `http://osrm:5000`, our own server. Empty: the public OSRM demo. |
| `OSRM_FALLBACK_URL` | API env (optional) | Asked only when our server is unreachable / 5xx. Default: the public demo. Set to an empty string to turn the fallback off. |
| `ROUTE_TRUCK_MAX_KPH` | API env (optional) | OSRM times a car; each leg is timed at no more than this. Default `80`. |
| `OSRM_IMAGE` | repo variable / compose env | Default `ghcr.io/project-osrm/osrm-backend:v5.27.1`. |
| `OSRM_MAP_URL` | repo variable | Default Geofabrik GCC States (Saudi + UAE, Kuwait, Qatar, Bahrain, Oman). |
| `OSRM_MEM_LIMIT` / `OSRM_CPU_LIMIT` | compose env | Default `1g` / `0.5`. |

## The road ahead of a truck (one route per trip)

`GET /vehicles/live-map/trips/:id/route-ahead` — used by the web live map,
the trip page map and the operator app, so all three show the same line, km
and arrival (`computedAt + durationSeconds`). `services/routing/routeAhead.ts`:

- The route is asked once from the truck's position **with its heading**
  (OSRM `bearings`, only while driving ≥ 10 km/h), so it starts on the
  truck's side of the road — no invented U-turns at interchanges.
- Each later fix is placed on that same route, searching forward from the last
  spot (a cloverleaf or a road doubling back can't pull it back or ahead); only
  the part still ahead is sent, so road already driven is never drawn.
- A new route only when the truck really leaves it (250 m off on 2 fixes in a
  row, or 1.5 km off at once), the next stop changes, or the route is 3 h old —
  at most once per 30 s per trip. One stray GPS fix keeps the old route.
- Kept in the API's memory; screens asking together share one OSRM request.

- The arrival shown is held steady: it only moves when it changes by 3 min
  or more (`ETA_STEADY_MIN`), so screens don't tick ±1 min on every fix.

Tests: `npm run test:routing` (`routeAhead.test.ts`).

## One rule set: `@mercon/shared-types` fleetRules

On trip / delayed / free, silent GPS, late, stopped long, the ETA (and its
straight-line estimate when there's no road route), truck speed (80 km/h),
what counts as late (5 min grace) and when to alert (15 min) are written once
in `packages/shared-types/src/fleetRules.ts`. The web live map
(`lib/fleetLive.ts`), the operator app (`features/fleet/fleetModel.ts`), the
API's late alerts and the customer tracking page all use it. Change a rule
there, not in an app. Tests: `npm run test:fleet-rules`.

## ETA watcher, accuracy and "going to be late"

`services/tracking/etaWatcher.ts`, every 5 min, for every running trip's truck:
- records the ETA to the next stop (`EtaPrediction`, at most every 10 min per
  stop, kept 120 days);
- when the road ETA is 15 min+ past the stop's planned arrival and the trip
  isn't already Delayed, sends every Admin and Operator a **"TRP-… is going to
  be late"** notification (push too), once per stop; tapping it opens that stop.

**System health → ETA accuracy** (`GET /settings/eta-accuracy`, Admin and
Operator): for stops reached in the last 7/30/90 days, predicted vs actual
arrival — typical miss, share within 15 min, 9-in-10 bound, and whether trucks
come earlier or later than said — split by how far ahead it was predicted.
Straight-line estimates are counted apart.

The customer tracking page's ETA to the next stop is the same shared route, so
customers see the operators' arrival time.

## How it runs

- **Build — never on the VPS.** `.github/workflows/build-osrm.yml` (monthly on
  the 3rd, or *Run workflow* by hand) runs on a GitHub-hosted runner:
  downloads the map, keeps only roads (`osmium tags-filter`), runs
  `osrm-extract` (car profile) → `osrm-partition` → `osrm-customize`, and
  refuses to ship data whose Riyadh → Jeddah route isn't 800–1200 km.
- **Install — production runner.** Unpacks into
  `/var/lib/mercon/osrm/releases/<date>-<run>`, points
  `/var/lib/mercon/osrm/current` at it, recreates the `osrm` container
  (compose profile `routing`) and asks it for a route from inside
  `mercon-api`. If that fails, the previous map goes back (or, the first
  time, the container is stopped) and the job fails. Two map releases are
  kept on disk.
- **Normal deploys don't touch it.** The service is in the `routing` profile,
  so `docker compose up` in `ci-cd.yml` neither starts nor waits for it.
- **If it's down,** the API asks the public OSRM demo instead (3 s timeout on
  ours first), so routing degrades instead of stopping. A "no road route"
  answer from our server is final — no fallback.

## First-time setup

1. Release the change that adds the `osrm` service (dev → main as usual).
2. Actions → **Build Route Server Map (OSRM)** → *Run workflow*.
3. Check the job's "Unpack, switch and check" log ends with
   `✓ Route server answers on real roads`.

## Checks on the server

```bash
docker compose -p mercon --profile routing ps osrm
docker compose -p mercon logs --tail=50 osrm
docker exec mercon-api curl -s "http://osrm:5000/route/v1/driving/46.6753,24.7136;39.8262,21.4225?overview=false" | head -c 300
ls -l /var/lib/mercon/osrm/ /var/lib/mercon/osrm/releases/
```

Turn it off: `docker compose -p mercon --profile routing stop osrm` — the API
falls back to the public demo by itself.
