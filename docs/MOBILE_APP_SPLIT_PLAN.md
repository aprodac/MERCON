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
  driver-app/        ← today's mercon-app, renamed (keeps git history + EAS project)
  operator-app/      ← new Expo project
packages/
  shared-types/      ← unchanged
  mobile-shared/     ← NEW: code both apps use (api, auth core, theme, UI kit, i18n)
```

`mobile-shared` is consumed exactly like `shared-types` is today: a `file:` dependency +
Metro `extraNodeModules` + tsconfig `paths`. It ships **TypeScript source only, no build
step** (Metro compiles it) — so no `prepare`/`install` scripts (CLAUDE.md rule).

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

**Shared (`packages/mobile-shared`)**
- `lib/`: `api`, `secure-store`, `query-client`, `trips`, `vehicle`, `documents`, `search`,
  `translations`, `language-context`, `theme-context`, auth core (token storage, session,
  logout — each app wraps it with its own login call)
- `theme/tokens`, `constants/theme`, `hooks/*`, `shared/components/*`, `shared/hooks/*`
- UI kit: `Button`, `Card`, `Input`, `Badge`, `Toast`, `Typography`, `Avatar`,
  `BilingualText`, `StopRole`, `TripProgressStepper`, `DriverChargePill`,
  `common/AppModal`, `common/DateTimePickerModal`
- `global.css` / Tailwind preset (each app's `tailwind.config.js` must include
  `packages/mobile-shared/**` in `content`, or NativeWind drops the classes)

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

### Step 1 — Quick win: shrink images (independent, do first)
- Convert large PNG illustrations to WebP, resized to the largest size they're shown at
- Remove the duplicate (`loading.png` and `start_loading.png` are byte-identical in size — confirm, then dedupe)
- Expected: ~14 MB → ~1–2 MB. Benefits the driver app regardless of the split.

### Step 2 — Create `packages/mobile-shared`
- Move shared files (list above) into the package; keep internal relative imports working
- Wire it into `mercon-app` (`file:` dep, Metro `extraNodeModules` + `watchFolders`,
  tsconfig `paths`, Tailwind `content`)
- Update imports in `mercon-app` (`@/lib/api` → `@mercon/mobile-shared/api`, etc.)
- Verify: `tsc --noEmit` clean, app still runs with both roles, **no behaviour change**

### Step 3 — Turn `mercon-app` into `driver-app`
- `git mv frontend/mobile-app/mercon-app frontend/mobile-app/driver-app`
- Delete operator routes/screens/features/nav/sidebar + operator-only lib files
- `index.tsx` → driver home only; `_layout.tsx` → drop operator stack screens and role branches
- Login: phone + license only; remove the operator fallback
- `app.config.ts`: name `Mercon Driver`, slug `mercon-driver`, scheme `mercondriver`,
  bundle/package `tech.mercon.driver`. **Keep the existing EAS `projectId`** (keeps push
  credentials history and build numbering). Keep the `APP_CLIENT` multi-client profile system.
- Remove deps no longer imported (verify each with grep); also drop unused
  `@expo/ui`, `expo-glass-effect`, `expo-symbols`, `expo-web-browser` if still unreferenced
- `eas.json`: add an AAB production profile for Play Store; keep APK `preview` for sideload

### Step 4 — Create `operator-app`
- New Expo project with the same SDK/React Native versions (`expo ~57`, RN `0.86.0`) and the
  same babel/metro/tailwind setup
- Move `app/operator/*` to the new app's root routes, plus operator screens/features/nav
- Own `index.tsx` (operator home), `_layout.tsx` (operator stack + `OperatorBottomNav`)
- Own login screen: username + password; **reject `Driver` sessions** with a clear
  "Use the Mercon Driver app" message
- `app.config.ts`: name `Mercon Operator`, slug `mercon-operator`, scheme `merconoperator`,
  bundle/package `tech.mercon.operator`; only the permissions it needs (no location/camera
  unless an operator feature needs them)
- `eas init` → **new EAS project** (new `projectId`)
- Only install deps it imports

### Step 5 — Backend check (expected: no code changes)
- Both login endpoints already exist and are role-specific
- Push notifications are driver-only (`pushNotificationService.sendDriverPushNotification`,
  `driverDevice` table) → unaffected by the operator app
- **Credentials:** new package/bundle IDs need new push credentials — FCM (Firebase Android
  app for `tech.mercon.driver`) and APNs for iOS, uploaded to EAS for the driver project.
  Without this, driver push notifications silently stop.

### Step 6 — Build & CI
- `bitrise.yml`: `cd frontend/mobile-app/mercon-app` → `driver-app`; add an operator workflow
  if needed
- Root `package.json`: replace `mobile` / `mobile:tunnel` with `mobile:driver` and
  `mobile:operator`
- Metro `workspaceRoot` path stays `../../..` (same depth)

### Step 7 — Docs (same change set, per CLAUDE.md Rule 0.5)
- `CLAUDE.md` "Who uses which app" table → two rows (Driver app / Operator app)
- `frontend/mobile-app/*/AGENTS.md`, `DEVELOPER_GUIDE.md`, root `README.md` + `package.json` description
- `PROGRESS.md`: add the split as a tracked item, update when each step lands

### Step 8 — Verification
- `tsc --noEmit` in both apps and `mobile-shared`
- `npx expo export` for each app → compare bundle + asset sizes against today's app
- Build both on EAS (preview), install on a real Android phone:
  - Driver: login, trip flow (pickup → stop → delivery → completed), photos/geotag,
    live tracking visible on web dashboard, push notification arrives
  - Operator: login, create trip, lists (drivers/vehicles/customers/quotations), trip details
  - Wrong role: driver credentials in operator app are rejected (and vice versa)
- Web dashboard and API unaffected (no code changes there)

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
