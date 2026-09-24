# Mobile App Split Plan — Driver App + Operator App

**Status:** Approved — in progress · **Created:** 2026-09-24

## Goal

Split the single role-based Expo app (`frontend/mobile-app/mercon-app`) into two
separately installed apps, so drivers never download operator code, libraries, or
assets — and the operator app can grow freely.

| App | Bundle ID (iOS + Android) | Display name | Who logs in | Login method |
|---|---|---|---|---|
| Driver app | `tech.mercon.driver` | Mercon Driver | `Driver` only | phone + license (`POST /mobile/auth/login`) |
| Operator app | `tech.mercon.operator` | Mercon Operator | `Operator` + `Admin` | username + password (`POST /auth/login`) |

Roles are unchanged — still exactly `Admin`, `Operator`, `Driver`. Only packaging changes.

## Target layout

```
frontend/mobile-app/
  package.json       ← mobile npm workspace root (lockfile + hoisted node_modules)
  driver-app/        ← was mercon-app (keeps git history + EAS project)
  operator-app/      ← new Expo project
  shared/            ← @mercon/mobile-shared: code both apps use (api, theme, UI kit, i18n)
packages/
  shared-types/      ← unchanged
```

**Why `frontend/mobile-app/shared` and not `packages/mobile-shared`** (changed during step 2):
the repo root `node_modules` has the web dashboard's React (19.2.8) while mobile uses 19.2.3.
Shared code under `packages/` would resolve the root copy → two Reacts → crash. A mobile-only
npm workspace (`frontend/mobile-app/package.json`, workspaces `mercon-app` + `shared`) keeps one
React/React Native for both apps and the shared code. `@mercon/mobile-shared` ships
**TypeScript source only, no build step** (Metro compiles it) — no `prepare`/`install` scripts
(CLAUDE.md rule). Imports look like `@mercon/mobile-shared/lib/api`.

## What goes where (from current code analysis)

**Driver app only**
- Routes: `app/trip/*`, `trips`, `profile`, `vehicle`, `settings`, `driver-charges`,
  `cargo-pod-photos`, `cargo-photo-preview`, `performance-overview`, `personal-info`,
  `change-password`, `documents`, `notifications`
- `screens/driver/*`, `navigation/DriverBottomNav`
- `lib/`: `DriverLiveTracking`, `use-live-tracking`, `use-current-trip`, `use-scheduled-trips`,
  `use-trip-history`, `use-profile`, `profile`, `emergency`, `geo`, `maps`, `routeParser`,
  `sound`, `camera`, `notifications` + `use-notifications`, `socket`
- Components: `DriverNotificationManager`, `FadedBottomIllustration`, `GeotagPhotoModal`,
  `GoogleMapsGeotagPreview`, `DelayButton`/`DelayReportModal`, `ReturnLoadingModal`,
  `common/OsmMapView`, `utils/geotagImageGenerator`, `assets/leaflet`
- Big illustrations (`completed/delivery/stop/loading/start_loading/login-hero/home-bg.png`)
- Native deps only drivers need: `expo-location`, `expo-image-picker`,
  `expo-image-manipulator`, `react-native-view-shot`, `react-native-webview`,
  `expo-notifications`, `expo-device`, `socket.io-client`

**Operator app only**
- Routes: `app/operator/*` (become the app's root routes)
- `screens/operator/*` (incl. `create-trip/`, `hooks/`), `features/*` (customers, drivers,
  quotations, vehicles, dashboard), `navigation/OperatorBottomNav`, `OperatorSidebarDrawer`,
  `NewTripMenuModal`, `MonthlyCalendarSelector`
- `lib/`: `operator`, `monthlyRotation`, `quotationMatching`, `quotationSearch`, `travelTimeService`

**Shared (`frontend/mobile-app/shared`, `@mercon/mobile-shared`)**
- `lib/`: `api`, `secure-store`, `query-client`, `trips`, `vehicle`, `documents`, `search`,
  `translations`, `language-context`, `theme-context`, auth core (token storage, session,
  logout — each app wraps it with its own login call)
- `theme/tokens`, `constants/theme`, `hooks/*`, `shared/components/*`, `shared/hooks/*`
- UI kit: `Button`, `Card`, `Input`, `Badge`, `Toast`, `Typography`, `Avatar`,
  `BilingualText`, `StopRole`, `TripProgressStepper`, `DriverChargePill`,
  `common/AppModal`, `common/DateTimePickerModal`
- `global.css` / Tailwind preset (each app's `tailwind.config.js` must include
  `../shared/**` in `content`, or NativeWind drops the classes)

> The classification above comes from an import scan. Step 2 confirms it with `tsc` —
> anything misplaced shows up as a broken import and gets moved.

**Known cross-links to untangle**
- `app/index.tsx` imports both home screens → each app gets its own `index`
- `components/MonthlyCalendarSelector.tsx:30` imports `features/drivers/.../DriverAvatar` → operator-only, moves with it
- Operator code navigates to root `/documents` and `/notifications` (driver screens) →
  point to operator's own `operator/documents`; give operator its own notifications
  screen or move the shared one to `mobile-shared`
- `_layout.tsx` role branching (`role === 'Driver'` nav/tracking) → removed; each app has one layout
- `LoginScreen` does driver login with operator fallback → split into two single-purpose logins

## Steps

Each step leaves the repo in a working state and is its own commit.

### Step 1 — Shrink images + icons ✅
- Bundled illustrations → WebP, duplicate `start_loading.png` removed (~11 MB → ~0.6 MB)
- 1b: per-icon `lucide-react-native` imports (Babel plugin + Metro resolver), JS 5.94 → 4.51 MB

### Step 2 — Create the mobile workspace + `@mercon/mobile-shared` ✅
- Move shared files (list above) into the package; keep internal relative imports working
- Wire it into `mercon-app` (workspace link, Metro `nodeModulesPaths`, Tailwind `content`)
- Update imports in `mercon-app` (`@/lib/api` → `@mercon/mobile-shared/lib/api`, etc.)
- Done 2026-09-24: 30 files moved (lib: api, secure-store, query-client, trips, vehicle,
  documents, search, translations, language-context, theme-context; theme/tokens; UI kit;
  `src/shared/components` → `ui/`, `src/shared/hooks` → `hooks/`), 148 importers rewritten.
  Kept in the app for now (depend on driver-only code): `TripProgressStepper`, `DriverChargePill`.
  Unused Expo template leftovers not moved: `hooks/use-theme`, `hooks/use-color-scheme`, `constants/theme`.
- Verify: `tsc --noEmit` clean, app still runs with both roles, **no behaviour change**

### Steps 3 + 4 — `driver-app` and `operator-app` ✅ (2026-09-24)
Done together with the code reorganisation the owner asked for.

**Driver app** (`frontend/mobile-app/driver-app`, renamed from `mercon-app`)
- Name `Mercon Driver`, bundle/package `tech.mercon.driver`, scheme `mercondriver`.
  Slug stays `mercon-app` and the existing EAS `projectId` is kept (the slug is bound to it).
- Driver-only login (phone + license); `role` branching removed from `index`/`_layout`.
- Reorganised: `screens/driver/*` → `screens/`; loose `lib/` split into `hooks/` (use-*),
  `services/` (auth, notifications, profile, emergency, socket, maps, sound), `utils/`
  (geo, routeParser, geotagImageGenerator); `DriverLiveTracking` → `components/`.
- Deleted Expo template leftovers: `hooks/use-theme`, `hooks/use-color-scheme(.web)`,
  `constants/theme`, template images (expo/react logos, tabIcons, tutorial-web, splash-icon,
  icon, android-icon-foreground). Kept: unreferenced Mercon art (`completed.png`, `home-bg.png`,
  `logo-glow.png`), `App.tsx` (old React Navigation entry, not used by expo-router) and the
  screens only it references (`SplashScreen`, `ReplacementDriverScreen`).
- Removed unused deps: `@react-native-community/datetimepicker`, `@react-navigation/bottom-tabs`.
  `expo-symbols` / `@expo/ui` / `expo-glass-effect` stay — `expo-router` itself depends on them,
  so the 962 KB Material Symbols font cannot be dropped.

**Operator app** (`frontend/mobile-app/operator-app`, new)
- Name `Mercon Operator`, bundle/package `tech.mercon.operator`, scheme `merconoperator`,
  slug `mercon-operator`. Needs `eas init` once for its own EAS `projectId`.
- Login: username/phone + password (`POST /auth/login`); Driver accounts get
  "use the Mercon Driver app" (`err_use_driver_app`). `Operator` + `Admin` allowed.
- Routes moved from `/operator/*` to the root (`/trips`, `/drivers`, …); every route file is a
  thin wrapper around a `features/*/screens/*` screen.
- Everything in the `features/` layout: new `trips` (list, details, create-trip + its sections,
  hook, quotation/rotation/travel-time services, `MonthlyCalendarSelector`), `invoices`, `more`,
  `documents`, `expenses`, `maintenance`, `third-party`; edit screens joined their features.
  Deleted the superseded `screens/operator/{Home,DriverList,CustomerList,VehicleList}Screen`.
- No push, live-tracking, map or view-shot libraries. Keeps camera + location (trip media
  uploads are geotagged by the shared `chooseMedia`).

**Shared** (`@mercon/mobile-shared`) gained: generic `lib/auth-context` (each app passes its
`signIn` strategy, allowed roles and session hooks), `screens/LoginScreen`, `lib/camera`,
`UserFacingError`, brand assets (`assets/images`: app icon, logos, login hero) and build tooling
(`tooling/`: Metro config factory, Tailwind preset, lucide Babel plugin).
Also removed the `components/index.ts` barrel (it pulled both apps' components together).

**Verified:** `tsc` clean in all three packages; Android `expo export` of each app → 3.8 MB JS
each (was 4.5 MB combined), no file from the other app in either bundle, one React/RN copy,
driver-only libraries absent from the operator bundle; every `router.push/replace/href` target
exists as a route (script check).

**Pre-existing bugs found:**
- Driver home "View All" pushed `/(tabs)/trips` (no such route) → fixed to `/trips`.
- Operator dashboard bell pushes `/notifications`, which was the *driver* notifications screen
  calling `/mobile/notifications` (backend: Driver-only → 403). The operator app has no
  notifications screen yet — **owner decision needed**.
- Operator "View all documents" opened the driver's documents screen; in the operator app
  `/documents` is the operator documents list, so this is fixed by the split.

### Step 5 — Backend: no code changes needed
- Both login endpoints already exist; push notifications are driver-only
  (`pushNotificationService`, `driverDevice` table).
- **Still to do (owner, needs store/Firebase access):** push credentials for `tech.mercon.driver`
  — FCM (Firebase Android app) and APNs, uploaded to the driver EAS project. Without them
  driver push notifications silently stop.

### Step 6 — Build & CI ✅ (driver) / ⬜ (operator)
- `bitrise.yml` and both GitHub mobile workflows point at `driver-app` and install from the
  mobile workspace root. No CI workflow builds the operator app yet.
- Root scripts: `mobile:driver`, `mobile:operator` (+ `:tunnel` variants).
- `eas.json` `production` already builds an AAB on Android (EAS default).

### Step 7 — Docs ✅
- `CLAUDE.md` app table, `README.md`, `DEVELOPER_GUIDE.md` (root + driver-app), onboarding guide,
  `docs/ui-kit-docs/design.md`, `operator-app/README.md`, `PROGRESS.md`.

### Step 8 — Device verification ⬜
- Build both on EAS (preview), install on a real Android phone and an iPhone:
  - Driver: login, trip flow (pickup → stop → delivery → completed), photos/geotag,
    live tracking visible on web dashboard, push notification arrives
  - Operator: login, create trip, lists (drivers/vehicles/customers/quotations), trip details,
    media upload
  - Wrong role: driver credentials in the operator app are rejected

## Rollout
- The current app (`tech.merconmobile.app`) is **not published** and not on drivers' phones,
  so there is no migration — both new apps ship fresh to Play Store and App Store.

## Owner decisions (2026-09-24)
1. **Branch:** all work on `ilan` (owner instruction for this task).
2. **Admin:** can log in to the operator app, same as Operator. Driver sessions are rejected.
3. **Published?** No — no existing installs to migrate.
4. **Icons:** same Mercon icon for both apps.
5. **Platforms:** Android **and iOS** for the first release → both apps need APNs credentials
   (push for the driver app) and App Store Connect records for both bundle IDs.
