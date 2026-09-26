# Round-Trip Stop Data Corruption — Investigation & Fix Report

**Date:** 2026-09-19
**Branch:** `ilan` (not committed/pushed — see "Handoff notes" at the end)
**Trip used as the reproduction case:** `TRP-0252` (Riyadh → Medina round trip)

---

## 1. Problem statement

The owner reported that the same round trip showed **three different, mutually
inconsistent routes** depending on which screen displayed it:

| Screen | What it showed |
|---|---|
| Web dashboard → Trip Details | 5 milestones: Riyadh → Riyadh → Medina (Turnaround) → Riyadh → **Medina** (labeled "Return Delivery") |
| Driver mobile app → trip card | 6 stops: Pickup Riyadh → **Intermediate Stop #1 Riyadh** (never configured) → Intermediate Stop #2 Medina → Delivery Medina → Return Loading Medina → Return Delivery Riyadh |
| Web dashboard → trip creation wizard | Correct: Riyadh → Medina, Return Medina → **Riyadh** |

The trip creation wizard was unambiguously correct: the return leg was
explicitly configured to end back in Riyadh. Both the web Trip Details page
and the driver app disagreed with it — the app showed a stop that was never
created, and the web page showed the trip ending in the wrong city.

The owner's instruction was to find the actual cause (not just patch the
symptom) and consolidate the logic so this class of bug becomes structurally
impossible to reintroduce.

---

## 2. Investigation

### 2.1 First pass — display-layer audit

An audit of every place in the codebase that turns a trip's raw `TripStop`
rows into a human-readable route found **three independently written,
disagreeing algorithms**:

1. `backend/api-server/src/services/mobileTripLogic.helper.ts` — a hand-copied
   "mirror" of the mobile app's logic, written for backend unit tests only,
   **never actually called by any API endpoint**.
2. `frontend/mobile-app/mercon-app/src/lib/routeParser.ts` +
   `lib/trips.ts` — the real mobile app logic, with 5 fallback strategies. The
   backend "mirror" above had drifted out of sync with this (missing 3 of the
   5 strategies, and a narrower `isRoundTrip()` check).
3. `frontend/web-dashboard/src/components/trips/VisualRouteProgress.tsx` — a
   third, completely different algorithm that groups stops by matching city
   *names* between adjacent stops, rather than trusting `leg_index`.

This explained *why* three screens could disagree in principle, but not why
the *raw stop data itself* looked wrong (an actual extra stop existed in
`TripStop` rows that no display bug could fabricate on its own).

### 2.2 Second pass — finding the actual root cause

Tracing the write path (not just the read path) found the real bug in
[`backend/api-server/src/controllers/tripController.ts`](../../backend/api-server/src/controllers/tripController.ts),
function `bulkImportTrips` — **the endpoint the trip creation wizard actually
calls** (`useTripSubmission.ts` → `tripService.bulkImport(rows)`), not the
separate, less-used `createTrip` endpoint.

The wizard's request body always contains **both**:
- a correct, structured `stops[]` array (`leg_index`/`stop_type`-aware, built
  by `useTripSubmission.ts`), **and**
- legacy display strings, `origin` and `destination` (e.g.
  `destination: "Medina [RETURN: Medina → Riyadh]"`), sent alongside it for
  backward compatibility with older CSV-import tooling.

The old code in `bulkImportTrips` did this (paraphrased):

```js
const baseStops = parseFullTripStops(row.origin, row.destination); // re-parses the STRING, ignoring row.stops
let parsedStops = row.stops?.length
  ? [
      ...(baseStops[0] ? [baseStops[0]] : []),   // ← prepend a duplicate origin stop
      ...row.stops.map(...),                        // the correct structured stops
      ...(baseStops[1] ? [{ ...baseStops[1] }] : []) // ← append a duplicate destination stop
    ]
  : baseStops;
```

Even though `row.stops` was already correct, the code **unconditionally**
re-derived a second, cruder stop list from the origin/destination strings and
spliced its first and last entries onto the front and back of the real array.

For `TRP-0252` this turned 4 correct stops into 6:

```
[Riyadh (dup, leg0 Pickup),
 Riyadh (real, leg0 Pickup),
 Medina (real, leg0 Dropoff),
 Medina (real, leg1 Pickup),
 Riyadh (real, leg1 Dropoff),
 Medina (dup, leg0 Dropoff, appended LAST with an overwritten stop_sequence)]
```

This single bug fully explains both symptoms:
- **Driver app's phantom "Intermediate Stop #1 Riyadh"** = the duplicate
  Riyadh stop spliced onto the front, pushing the real pickup into
  "intermediate" position.
- **Web's trip ending in "Medina" labeled "Return Delivery"** = the duplicate
  Medina stop spliced onto the *back*, so by raw `stop_sequence` — which the
  web timeline trusts for "what's the last/final stop" — it really is the
  last row, burying the true return-delivery stop (Riyadh) in second-to-last
  position.

This is **not round-trip-specific**: the same splicing ran for every trip
created through the wizard, including plain one-way trips (duplicate origin
prepended, duplicate destination appended), just less visibly since a 2-stop
trip silently becoming 4 stops with two adjacent duplicates is harder to
notice at a glance than a round trip's leg ending in the wrong city.

There was also no guardrail: `validateTripStops` (which checks `leg_index`/
`stop_sequence` structural invariants) existed and was wired into the older
`createTrip` endpoint, but was **never called from `bulkImportTrips`**, so
this corruption wrote silently with no error.

---

## 3. Fix

### 3.1 Root cause fix — stop double-deriving stops

**File:** `backend/api-server/src/controllers/tripController.ts`,
`bulkImportTrips`

`row.stops` is now used as-is whenever the client sends it. The legacy
`parseFullTripStops(origin, destination)` string parser now only runs when
`row.stops` is absent entirely (true legacy CSV rows with no structured
data) — it can never again run *alongside* and corrupt an already-correct
structured array.

### 3.2 Guardrail — fail loudly instead of silently corrupting

Added a `validateTripStops(parsedStops)` call in `bulkImportTrips` (previously
only present in the separate `createTrip` endpoint), so a future regression
of this kind rejects the row with a validation error instead of writing bad
rows to the database.

### 3.3 Testability — extracted the pure parser

`parseFullTripStops` was inline in the 2,700-line `tripController.ts` and not
exported, so the fix couldn't be unit tested directly (importing
`tripController.ts` standalone crashes — it's wired for Express app
bootstrap, not standalone import, due to a route-registration circular
import). Extracted it verbatim to its own pure module,
`backend/api-server/src/services/legacyStopStringParser.ts`, with zero
behavior change, and imported it back into `tripController.ts`.

### 3.4 Regression test — locks in the fix

New file: `backend/api-server/src/services/bulkImportStopResolution.test.ts`.
It replicates the exact `parsedStops` resolution logic from `bulkImportTrips`
(post-fix) and asserts against the wizard's actual request shape:

- A round trip like TRP-0252 produces exactly 4 stops, not 6, with the last
  stop being the real return delivery (Riyadh, leg 1).
- A plain one-way trip produces exactly 2 stops, not 4.
- A round trip with intermediate stops on both legs produces exactly 6 stops
  (no extra splice on top of legitimate intermediates).
- True legacy CSV rows with **no** `stops[]` array still correctly fall back
  to `parseFullTripStops`.
- A final test keeps a copy of the **old, buggy** resolution logic side by
  side and proves it really did produce the corrupted 6-stop/duplicate-Medina
  output for the exact TRP-0252 input — so this isn't a hypothetical
  regression risk, it's a demonstrated one, pinned by a test.

### 3.5 Consolidation — single server-computed timeline (the owner's explicit ask)

To eliminate the *class* of bug (three algorithms disagreeing), not just this
instance:

- Promoted the backend's test-only "mirror"
  (`services/mobileTripLogic.helper.ts`, already covered by the pre-existing
  24-case `multiStopRoundTrip.test.ts` suite) to the actual production
  module, renamed **`services/tripRouteTimeline.ts`**.
- Fixed its `isRoundTrip()` — it was missing 3 of the 5 signals the real
  mobile app's `isRoundTrip()` checks (the `[RETURN:]` marker on individual
  stops, the "second Pickup" signal, and the circular first==last-stop
  signal).
- Both `getTripById` (web) and every mobile trip endpoint (via
  `formatMobileTrip` in `mobileTripController.ts`) now attach a
  server-computed **`route_timeline`** array to the trip API response.
- `VisualRouteProgress.tsx` (web) now renders that `route_timeline` directly
  when present, instead of re-deriving one with its own city-name-matching
  heuristic. It only falls back to the old local derivation when no timeline
  is supplied (see §5, known gap).
- The mobile app's `routeParser.ts` → `parseTripRouteNodes()` now prefers
  `trip.route_timeline` from the API the same way, keeping its own 5-strategy
  local parsing only as a fallback for trips fetched without it (e.g. stale
  offline cache).
- Fixed a related, independently-discovered bug in `HomeScreen.tsx` (driver
  app home card + "Upcoming Scheduled Trips" list): it picked "the" dropoff
  stop via `.find(s => s.stop_type === 'Dropoff')`, which returns the
  **first** match — on a round trip that's the outbound delivery, not the
  true final destination. Now takes the pickup from the front and the
  dropoff from the back of the sequence-sorted stop list.

---

## 4. Testing performed

| Check | Result |
|---|---|
| `tsc --noEmit` — backend | ✅ clean |
| `tsc --noEmit` — web dashboard | ✅ clean |
| `tsc --noEmit` — mobile app | ✅ clean |
| Backend test suite (`src/services/*.test.ts`) | ✅ **132/132 pass** (127 pre-existing + 5 new) |
| `multiStopRoundTrip.test.ts` (24 round-trip architecture cases, unchanged by this fix, re-verified) | ✅ all pass |
| New `bulkImportStopResolution.test.ts` (5 cases, see §3.4) | ✅ all pass, including the "old code reproduces the bug" proof |

No live/hosted-DB testing was performed — `mercon.tech`'s Postgres is a
separate database from local dev (per `CLAUDE.md`), and no credentials for it
were available in this session. Everything above is static analysis +
unit-level proof against the exact code paths involved. **The fix has not
been exercised through the running app end-to-end (no dev server / browser
click-through of the wizard was done in this session)** — see §5.

---

## 5. Known gaps / things the next person should check

Be honest with whoever picks this up — these are the loopholes as I see them:

1. **Historical trips are still corrupted.** `TRP-0252` and any other trip
   created through the wizard before this fix still has the duplicated stop
   rows in the database. This fix only prevents *new* corruption going
   forward. If the owner wants existing trips repaired, that needs a
   one-off data-cleanup script (identify trips with a leg-0 stop that
   duplicates the very next/previous stop's location and leg_index, remove
   it, and re-sequence) — **not written**, out of scope of this session.
2. **No end-to-end run performed.** I did not start the dev server, run the
   wizard through a browser, and confirm the created trip now looks correct
   in Trip Details + driver app live. Everything is verified at the unit/type
   level. Strongly recommend doing one real click-through
   (create a round trip → open Trip Details → open it in the driver app) on
   staging/dev before trusting this in production.
3. **`VisualRouteProgress.tsx`'s old derivation logic is still live**, not
   deleted — it's the fallback for 4 other call sites
   (`DriverDetailsPage.tsx`, `CargoLoadingView.tsx`,
   `ThirdPartyDetailsPage.tsx`, `CustomerDetailsPage.tsx`) that render a trip
   preview from list-style data rather than a full `getTripById` fetch, so
   `route_timeline` isn't available to them. This is intentional (not a
   half-fix) but means the old city-name-matching algorithm isn't fully dead
   code yet — if it has its own latent bugs, those 4 screens can still hit
   them. Not touched in this session because none of them were reported as
   broken.
4. **Mobile app's local fallback logic (`routeParser.ts`'s 5 strategies)
   still exists and is still what runs if `route_timeline` is ever missing**
   (e.g. a stale cached trip from before this deploy, or a future endpoint
   that forgets to attach it). It was *not* rewritten to match the backend
   exactly — only re-prioritized behind the server payload. If a future
   endpoint returns a trip without `route_timeline`, the mobile app quietly
   falls back to its old (occasionally-wrong) local guessing rather than
   erroring — worth a follow-up to either guarantee `route_timeline` is
   always present, or make its absence loud in dev builds.
5. **`bulkImportTrips` still computes now-unused geocoding lookups**
   (`parsedDest`, `originCoords`, `destinationCoords`,
   `returnDestinationCoords` at the top of the loop) that were already dead
   code before this session (their results were never consumed) — left
   alone as out-of-scope cleanup, but worth removing later since they're
   wasted DB/geocoding calls on every bulk-import row.
6. **Branch/push policy is ambiguous.** `CLAUDE.md` has two contradicting
   rules — Rule 0.1 says the target branch is `hysam`, a later "Git Branch
   Policy" section says `midlaj` only — and the actual working branch in this
   session is `ilan`. Nothing has been committed or pushed; that decision was
   left to the owner rather than guessed.

---

## 6. Files changed

```
backend/api-server/src/controllers/tripController.ts          — bulkImportTrips fix + validateTripStops guardrail
backend/api-server/src/controllers/mobileTripController.ts    — attach route_timeline to mobile trip responses
backend/api-server/src/services/mobileTripLogic.helper.ts     — renamed →
backend/api-server/src/services/tripRouteTimeline.ts          — promoted to production module, isRoundTrip fixed, address/time matching hardened
backend/api-server/src/services/legacyStopStringParser.ts     — NEW: parseFullTripStops extracted for testability
backend/api-server/src/services/bulkImportStopResolution.test.ts — NEW: regression test for the TRP-0252 bug
backend/api-server/src/services/multiStopRoundTrip.test.ts    — import path updated for the rename
frontend/web-dashboard/src/components/trips/VisualRouteProgress.tsx — consumes server timeline when present
frontend/web-dashboard/src/pages/trips/TripDetailsPage.tsx    — passes trip.route_timeline through
frontend/mobile-app/mercon-app/src/lib/trips.ts               — route_timeline field on MobileTrip
frontend/mobile-app/mercon-app/src/lib/routeParser.ts          — prefers server route_timeline
frontend/mobile-app/mercon-app/src/screens/driver/HomeScreen.tsx — fixed first-match-Dropoff bug (2 call sites)
PROGRESS.md                                                     — §8 added, "Last updated" line bumped
```

(`frontend/mobile-app/mercon-app/package-lock.json` shows as modified in git
status but was already modified before this session started — not touched
here.)

---

## 7. Handoff notes for whoever continues this

- Nothing is committed. Run `git diff` / `git status` on branch `ilan` to see
  everything above before doing anything else.
- Confirm which branch this should actually target — `CLAUDE.md`'s policy is
  self-contradictory (see §5.6) — before pushing anywhere.
- If you want to verify this live: start the backend + web dashboard, create
  a new round trip through the wizard (Riyadh → Medina, round trip, no
  intermediates), open its Trip Details page, and confirm the timeline ends
  at Riyadh with exactly 4 milestones. Then open the same trip in the driver
  app / mobile trip endpoint response and confirm `route_timeline` is present
  and matches.
- If asked to fix historical data: query for trips whose `stops` include two
  consecutive-in-array rows with identical `leg_index`, `stop_type`, and
  `location_name` as another stop in the same trip that isn't a legitimate
  turnaround pair (turnaround pairs are `leg_index 0→1` transitions with
  matching location, which is correct and must NOT be touched) — that's the
  signature of this bug's corrupted rows.
