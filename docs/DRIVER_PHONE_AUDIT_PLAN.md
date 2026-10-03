# Driver phone health & notification audit — plan

**Status:** approved by owner 2026-10-01 · built 2026-10-01 (backend, web, driver app) — device verification on dev still to do. See *As built* at the end.
**Goal:** after a trip is handed to a driver, operators can see — on the web dashboard,
without phoning anyone — whether the driver's phone can actually receive work and report
back, and get warned *before* something goes wrong instead of during a delivery.

Six parts, all approved:

1. **Phone health** per driver (permissions, app version, battery, last seen)
2. **Pre-trip readiness** check → operator inbox
3. **Notification trail** per notification (sent → delivered → opened → read) + timed receipt job
4. **Trip acknowledgement** (driver taps "Got it" — no decline option, owner 2026-10-01)
5. **Driver activity log** (login/logout, status changes, online/offline …)
6. **Silent-driver alert** (active trip, app silent and no live truck GPS either)

---

## What exists today (checked 2026-10-01)

| Piece | Where | Gap |
|---|---|---|
| Push send via Expo | `backend/api-server/src/services/pushNotificationService.ts` | Reads the ticket only for errors; no receipts; nothing stored |
| Device tokens | `DriverDevice` (`schema.prisma:2185`), `POST/DELETE /mobile/devices` | Needs a token → a phone with notifications **denied** is invisible |
| Notifications | `Notification` model, `createDriverNotification` (`notificationController.ts:182`) | Only `is_read`; no opened/read time |
| Timed jobs | `tripDelayMonitor.ts` (`setInterval`, started in `index.ts:307`), `icces/fleetPoller.ts` | Pattern to copy |
| Location | Foreground only (`LiveNavigationScreen`, `EmergencyScreen`, camera) + `POST /mobile/trips/:id/location` | No permission status reported |
| Assignment history | `TripAssignmentEvent` | No driver response |
| Audit | `AuditLog` (web users' actions) | Nothing for driver-side events |
| Operator inbox | `services/operatorInbox.ts`, `OperatorInbox.tsx` | Has driver updates + doc expiries; add "Not ready" |
| Push credentials | iOS: APNs key → Expo pending (Hysam). Android: **FCM not set up** | Outside code — see Dependencies |

---

## Phase 0 — Mockup (web) · owner sign-off before building

`show_widget` mockups, following the dashboard rules (charcoal not black, one screen, coloured chips):

- **Driver list:** a "Phone" column — green/amber/red dot + tooltip ("Notifications off · last seen 3 h ago").
- **Driver details:** a "Phone & app" card — each permission, app version, battery, network, last seen, devices; **Send test push** button.
- **Trip details:** the trip timeline gains driver events — notified → delivered → opened → acknowledged; failures in red with reason.
- **Operator inbox:** a third tab **"Attention"** — not-ready drivers on upcoming trips, unacknowledged trips, silent drivers, failed pushes.
- **Notifications page:** delivery status chip per driver notification.

## Phase 1 — Backend schema (one Prisma migration, additive only)

New migration `prisma/migrations/2026100x_driver_phone_audit/`. Nothing is dropped or renamed.

**`DriverDevice` → one row per app install** (works even with notifications denied)
- `install_id String? @unique` — random UUID the app generates once and keeps in SecureStore
- `token` becomes **nullable** (a phone that denied notifications still reports health)
- Health columns (all nullable): `app_version`, `build_number`, `os_name`, `os_version`,
  `device_model`, `notif_permission` (`granted|denied|undetermined`),
  `location_permission` (`always|while_using|denied|undetermined`), `location_services_on`,
  `battery_level`, `low_power_mode`, `network_type`, `health_reported_at`
- `lastSeenAt` already exists — bumped on every health report / authenticated mobile call

**`PushDelivery`** — one row per notification × device
- `notificationId`, `deviceId?`, `expo_ticket_id?`,
  `status` (`NoDevice|Sent|Delivered|Failed|Unknown`), `error_code?`, `error_message?`,
  `attempts`, `sent_at`, `receipt_checked_at?`
- Index on `(status, sent_at)` for the job

**`Notification`** — add `opened_at?` (tapped from the push) and `read_at?` (kept alongside `is_read`)

**`TripAcknowledgement`** — history survives reassignment / trip changes
- `tripId`, `driverId`, `lat?`, `lng?`, `createdAt` (one row per assignment or change acknowledged)

**`DriverActivityEvent`** — the driver-side audit trail
- `driverId`, `tripId?`, `type` (`Login|Logout|AppOpened|WentOffline|CameOnline|PermissionChanged|TripStatusChanged|PhotoUploaded|Emergency|Acknowledged`),
  `lat?`, `lng?`, `metadata Json?`, `createdAt`; index `(driverId, createdAt)`, `(tripId, createdAt)`

**`ops_alerts` dedupe** — reuse `Notification` with `entity_type`/`entity_id` + a check
"same type for same entity in last N min" so jobs never spam operators (no new table).

## Phase 2 — Backend endpoints & hooks

Mobile (driver JWT):
- `POST /mobile/devices` — extended: accepts `install_id` + health snapshot, token optional
- `POST /mobile/health` — lightweight heartbeat (snapshot diff → `PermissionChanged` event)
- `POST /mobile/notifications/:id/opened`
- `POST /mobile/trips/:id/acknowledge`
- Existing endpoints write `DriverActivityEvent`: login (`mobileAuthController`), status change, photo upload, emergency
- Socket connect/disconnect for `driver:*` rooms → `CameOnline` / `WentOffline` (debounced 2 min so tunnels/lifts don't flood the log)

Web (`authorizeRoles('Admin','Operator')`):
- `GET /drivers/:id/phone` — devices + health + derived status (green/amber/red)
- `GET /drivers/phone-status` — compact status for the list / map
- `GET /drivers/:id/activity?from&to` and activity merged into the trip timeline (`tripRouteTimeline.ts`)
- `GET /notifications/:id/deliveries`
- `POST /drivers/:id/test-push` — logged in `AuditLog` (`DRIVER_TEST_PUSH`)
- Operator inbox: `GET /operator-inbox/attention`

`sendDriverPushNotification` rewritten to: create a `PushDelivery` per device (or one `NoDevice` row),
store the ticket id / error, deactivate on `DeviceNotRegistered` (unchanged behaviour).

**Phone status rules** (constants in one file, easy to tune):
- 🔴 red — no device · notifications denied · location denied · not seen > 24 h · app below minimum version
- 🟡 amber — not seen > 2 h · location services off · low-power mode · battery < 15 % · app not latest
- 🟢 green — everything else

## Phase 3 — The timed job: `services/tracking/driverWatch.ts`

One monitor, same pattern as `tripDelayMonitor` (`init…` / `stop…`, started in `index.ts`), ticks every 60 s
and runs each check on its own cadence:

| Check | Every | Does |
|---|---|---|
| Push receipts | 5 min | `Sent` rows > 15 min old → Expo `getReceipts` (≤ 1000 ids/call) → `Delivered`/`Failed`; `DeviceNotRegistered` → deactivate device; > 24 h → `Unknown` |
| Push retry | 5 min | Expo-side transient errors (HTTP 5xx / timeout) retried up to 3× with backoff |
| Readiness | 10 min | Trips starting within 2 h whose driver is 🔴/🟡 → "Not ready" in Attention + one notification to operators |
| Acknowledgement timeout | 5 min | Trip assigned, not acknowledged after 30 min → alert |
| Silent driver | 5 min | Active trip (`Loading`/`InTransit`/`Delayed`), app not seen 20 min **and** no truck GPS fix (ICCES) in 10 min → alert |
| Cleanup | daily | Delete `DriverActivityEvent`/`PushDelivery` older than retention (see Decisions) |

Every alert goes through the dedupe check, is sent to the same staff list as delay alerts
(`notifyOperatorsOfDelay`), and is idempotent — safe if two API containers ever run it.

## Phase 4 — Driver app (`frontend/mobile-app/driver-app` + `shared`)

- New deps: `expo-battery`, `expo-network`, `expo-application` → **needs a new native build** (Codemagic).
  Read the Expo v57 docs first (per `driver-app/AGENTS.md`).
- `services/phoneHealth.ts`: collects the snapshot (`getPermissionsAsync` for notifications + location,
  `hasServicesEnabledAsync`, battery, low-power, network, versions); sends on login, app foreground, every
  5 min while a trip is active, and when anything changes.
- Register device on login **even without a token** (install id + health).
- Push tap → `POST …/opened` (in `DriverNotificationManager`), opening the list → `read_at`.
- **"Got it"** card on a new/changed trip (Home + trip details), blocking until tapped. No decline option.
- In-app warning banner when notifications or location are off → button opens the phone's Settings.
- "Update required" screen when below the minimum version the API returns.
- No background location (unchanged — truck GPS comes from ICCES).

## Phase 5 — Web dashboard UI

Build the Phase 0 mockups: driver list column, driver "Phone & app" card + test push, trip timeline events,
Notifications page delivery chips, operator inbox **Attention** tab, live-map driver card shows the phone dot.
Role-gated in the UI (`RequireRole`) *and* backend.

## Phase 6 — Verify & ship

- Backend unit tests: status rules, receipt mapping, dedupe, ack-timeout + silent-driver timing.
- Typecheck/lint web, backend, mobile workspace; migration applied on a local DB.
- On dev: real iPhone + Android with a test driver — deny/allow permissions and watch the dashboard update;
  push → see Delivered; kill the app on a running trip → silent-driver alert.
- Ship via PR `ilan → dev`; `PROGRESS.md` updated per phase. Mobile changes reach drivers only after the new build is installed.

Suggested order of PRs: **(1)** schema + backend + job (no visible change) → **(2)** web UI →
**(3)** driver app build. The backend tolerates old app versions (all new fields optional), so
PRs 1–2 can go to production before the new app is out; old installs simply show "app outdated".

---

## Dependencies outside the code

- **iOS push:** APNs key uploaded to Expo (Hysam — `docs/IOS_DISTRIBUTION_AND_PUSH.md` Part B).
- **Android push:** Firebase project + `google-services.json` + FCM v1 key in Expo — **not set up**.
  Until then Android rows will show `Failed · InvalidCredentials`, which is at least visible now.
- **Driver rollout:** drivers must install the new build; the list shows who is still on an old version.
- Operator-app push is **not** in this plan (separate work, needs its own device table).

## Decisions for the owner

- ~~Can drivers decline a trip?~~ **No** — acknowledge only (owner, 2026-10-01).
1. **Timings** — defaults above (ack timeout 30 min, readiness window 2 h, silent 20 min, "not seen" 2 h / 24 h). OK?
2. **Retention** of activity log + push trail — recommended 180 days.
3. **Minimum app version** — who bumps it and when (suggest: admin setting, default = off until the new build is out).

---

## As built (2026-10-01)

Differences from the plan above, and where things live:

- **No decline option** — drivers can only tap "Got it" (owner, 2026-10-01).
- **Phase 0 mockups skipped** — owner said "do the rest"; the UI follows the existing detail-page / inbox styles.
  Screenshots from a real login still to be checked by the owner.
- **Silent driver** fires only when the truck's tracker is quiet too. The app only reports while it is open, so
  "app silent + truck parked" (e.g. waiting at a loading bay) was a false alarm.
- **Acknowledgement** is asked for `TripAssigned` only — a trip *change* sends the driver no notification today.
  Drivers on builds before 1.1.0 can't acknowledge, so they're never flagged "not acknowledged" (they show
  "old app version" instead).
- **No delivery chips on the web Notifications page** — that page lists staff notifications. Driver
  notifications and their delivery status are in the driver's *Phone & app* sheet and the trip's activity log.
- Inbox tab is called **Phones** (next to Alerts).
- Driver app version bumped to **1.1.0** (new native modules: expo-battery, expo-network, expo-application).

| Piece | Where |
|---|---|
| Migration | `backend/api-server/prisma/migrations/20261001090000_driver_phone_audit/` |
| Rules + timings | `backend/api-server/src/services/driverPhone/rules.ts` (+ `rules.test.ts`, `npm run test:driver-phone`) |
| Attention list | `backend/api-server/src/services/driverPhone/attention.ts` |
| Activity log, online/offline | `services/driverPhone/activity.ts`, `services/driverPhone/presence.ts` |
| Push trail + Expo receipts | `backend/api-server/src/services/pushNotificationService.ts` |
| Timed job | `backend/api-server/src/services/tracking/driverWatch.ts` |
| Mobile endpoints | `controllers/mobilePhoneController.ts` |
| Dashboard endpoints | `controllers/driverPhoneController.ts` |
| Driver app | `driver-app/src/services/phoneHealth.ts`, `components/AcknowledgeTripsPrompt.tsx`, `components/PhoneHealthManager.tsx`, `shared/lib/install-id.ts` |
| Web | `components/drivers/phone/*`, `components/trips/details/TripDriverTrail.tsx`, Phones tab in `OperatorInbox.tsx`, Driver app section in `pages/settings/SettingsPage.tsx` |
