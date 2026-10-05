# Driver app — handover (state on 5 Oct 2026)

For whoever picks up the MERCON **driver Android app** next (a person or an AI
chat). Read this first, then `docs/ANDROID_PLAY_RELEASE.md` (Play Store forms)
and `CLAUDE.md` (repo rules). For shipping later updates, see `docs/DRIVER_APP_UPDATES.md`.

Logins and passwords are **not** in this file on purpose: ask the owner.

---

## 1. Where things stand

| What | State |
|---|---|
| Live server (mercon.tech) | Released from `main` on 4 Oct, 8:26 PM IST (release PR #152 + follow-ups). Health OK. |
| Play Store file (AAB) | **Uploaded to Play Internal testing on 5 Oct 2026** (Play showed no errors, only the harmless deobfuscation warning). Version 1.2.0, version code 3, built from `main` commit `6f1356e`, connects to `https://mercon.tech/api`. Signing SHA-1 checked. Link (valid till 3 Nov 2026): https://expo.dev/artifacts/eas/kLtG2iaBmhpGJnn38keujO-87UBIAtUSaEnfYUxJA3Y.aab |
| Test APK (dev server) | Version 1.2.0, commit `94398a3` (same driver-app code as the AAB), connects to `https://dev.mercon.tech/api`. Link (valid till 18 Oct 2026): https://expo.dev/artifacts/eas/eRiXQcu6W_R3jHqvnn4OpGimDsdlhf_7bhGyfn6prLU.apk |
| Driver app code changes on `dev` since the AAB | None as of 5 Oct morning. Only operator app and quotation work landed since. |
| Next | 1) Confirm the internal testing rollout is live and testers got the opt-in link. 2) Run the Phase 4 test on the real phone with the test APK (§6). 3) Fix what it finds, release, build a new AAB (§3), upload as an update. |

### Testing done so far (real Realme RMX2030 phone, Android 10)

| Round | Result |
|---|---|
| Phase 1 — notifications + trip GPS | 15 pass / 2 fail → fixed |
| Phase 2 — full trips, delays, change driver | 11 pass / 2 fail / 1 blocked → fixed; retest 9/9 pass |
| Phase 3 — profile, settings, driver's own pages | 10 pass / 13 fail → fixed in PRs #165 (14 fixes), #166 (private document links), #167 (Urdu right-to-left) |
| Phase 4 — dashboard vs app, end to end (+ Phase 3 retest) | **Not run yet** — prompt in §6 |

Key findings that shaped the app:
- A sleeping Realme phone delayed pushes by ~6 min because the maker's battery
  manager froze the app. Fix: the **phone setup guide** shown after sign-in
  (`driver-app/src/components/PhoneSetupGuide.tsx`): notifications, location,
  maker background activity + auto-start. After it, a sleeping phone got its
  push in 1.1 s. Since 1.2.1 there is no Android "battery optimisation" step:
  MERCON never showed in that list on Realme. The full guide opens by itself
  only once per install; after "Later" a highlighted "Finish phone setup"
  button above the bottom bar reopens it until all steps are done.
- A phone charging on USB never sleeps, so "instant on the cable" proves nothing
  about real-life delivery. Test unplugged when it matters.

---

## 2. Rules you must not break

1. **Never change the Android app ID `tech.mercon.driver`.** It is the Play
   Store record, Firebase and the upload key. iOS stays `tech.merconapp.driver`
   (`driver-app/app.config.ts`). A teammate once changed the Android one by
   mistake; it was put back (PR #158).
2. **The signing key must never change.** Every store build is signed by the
   EAS default keystore. Upload certificate SHA-1:
   `E9:F7:09:B1:EC:A2:5C:39:AF:96:9D:73:1E:B1:D9:DD:1D:1C:BD:44`.
   Play's upload key was reset to this on 3 Oct.
   - Build store files **only on EAS** (Expo's servers), account `alan32`,
     project `2697c85a-0ac8-4a2e-9225-5cc84a5b518d`.
   - **Not Codemagic**: it has a different keystore.
   - **Not local gradle / `expo run:android` / `eas build --local`.**
   - Never let EAS "generate new credentials".
3. **Check every AAB before uploading** (§3, step 5). A wrong SHA-1 means Play
   rejects it.
4. **Release the server first.** The store app talks to mercon.tech, so the
   endpoints it uses must already be on `main` (`docs/RELEASE_PROCESS.md`:
   PR `dev` → `main`, never push to `main`).
5. **Secrets never go in chat or in git**: the Firebase service-account key
   (only uploaded to Expo), keystore files and passwords, Play JSON keys,
   login tokens.
6. **Test on dev, never on production.** The store AAB points at the live
   server with real drivers. Use the test APK (dev) for testing.
7. Version numbers: `eas.json` has `appVersionSource: "remote"` and
   `autoIncrement: true` on `production`, so EAS bumps the Android version code
   by itself (3 → 4 → …). The visible version (1.2.0) comes from
   `driver-app/version.json`; change it only for a new release name
   (`npm run version:bump -- patch|minor`).
8. No Expo over-the-air updates are set up. **Every app change needs a new
   AAB + Play upload.** Server-only changes reach the app with a normal release.

---

## 3. How to build

Builds run on Expo's servers. The GitHub workflow only queues them (a couple of
minutes), and the build itself takes ~15–20 min.

| Profile | Output | Server it talks to | Use |
|---|---|---|---|
| `preview` | `.apk`, install directly on a phone | dev (`https://dev.mercon.tech/api`) | Testing |
| `production` | `.aab` for Play | live (`https://mercon.tech/api`) | Play Store |

### Steps
1. Make sure the code you want is merged:
   - **`dev`** for a test APK
   - **`main`** for a Play AAB, released first per rule 4
2. Start the build, either way:
   - GitHub → Actions → **"Mobile Build (EAS)"** → Run workflow → pick the
     branch (`dev` or `main`), app `driver`, platform `android`, profile
     `preview` or `production`.
   - Or from a terminal with GitHub access:
     `gh api repos/aprodac/MERCON/actions/workflows/eas-build.yml/dispatches -f ref=main -f "inputs[app]=driver" -f "inputs[platform]=android" -f "inputs[profile]=production"`
3. Follow it at https://expo.dev → account alan32 → MERCON Driver → Builds.
   The download link appears when it finishes.
4. Check the build used the right commit (the "git commit" shown on the build page).
5. **Before uploading an AAB**, download it and run:
   ```
   keytool -printcert -jarfile app.aab | grep SHA1
   # must be E9:F7:09:B1:EC:A2:5C:39:AF:96:9D:73:1E:B1:D9:DD:1D:1C:BD:44
   unzip -p app.aab base/manifest/AndroidManifest.xml | strings | grep -m1 tech.mercon.driver
   unzip -p app.aab base/assets/app.config | grep -o 'https://[a-z.]*mercon.tech/api'
   # production must print https://mercon.tech/api (NOT dev.)
   ```
6. For an APK: `adb install -r app.apk`. Same key, so it updates in place.

### Things to keep in mind while building
- Don't add `prepare` / `install` scripts to workspace packages (it breaks the
  Docker deploy; see `CLAUDE.md`).
- `frontend/mobile-app` is its own npm workspace. Install there, not at the repo root.
- Code shared by the driver and operator apps goes in `frontend/mobile-app/shared`.
  Never import one app from the other.
- `ACCESS_BACKGROUND_LOCATION` is blocked on purpose (`android.blockedPermissions`).
  Trip GPS uses a location **foreground service** (permanent notification), so
  Play doesn't need the "Allow all the time" review. Don't add background
  location.
- `google-services.json` must stay the one for `tech.mercon.driver` (Firebase
  project `mercon-driver`), or pushes stop on Android.
- Keep `PROGRESS.md` updated with every change (repo rule).

---

## 4. Uploading to Play (internal testing)

1. Download the AAB (link in §1, or the newest build).
2. Play Console → **MERCON Driver** → Test and release → Testing → **Internal testing**.
3. **Create new release**, or **Edit release** if a draft exists. If asked about
   Play App Signing, choose "Use Google-generated key".
4. Upload the `.aab`. Wait for the row "3 (1.2.0)" (or the newer code).
5. Release notes, for example:
   ```
   <en-US>
   Instant trip notifications, trip GPS that keeps working in the background, phone setup guide, Urdu layout, bug fixes.
   </en-US>
   ```
6. Next / Save → **Save and publish** (Start rollout). Yellow warnings are fine;
   red errors block.
7. **Testers** tab: create an email list (Gmail addresses), save, copy the
   **Join on the web** link and send it. Testers open it → Become a tester →
   install from Play.

Errors you may hit:

| Error | What to do |
|---|---|
| Version code already used | Build again with profile `production`. The code goes up by itself. |
| Signed with the wrong key | You built with the wrong keystore. Rebuild on EAS (rule 2). |
| App content / declarations missing | Fill in the forms. Ready text is in `docs/ANDROID_PLAY_RELEASE.md` §4: foreground service (Location), Data safety, privacy policy URL, App access. |
| Privacy policy required | Needs a public web page. **Not made yet.** |

App access: Google reviewers need a working **driver login on the live server**.
Create a reviewer driver in the live dashboard (Drivers → Add Driver) and give
its phone + password in the form.

---

## 5. Open to-dos

- [x] Upload AAB version code 3 to internal testing (5 Oct 2026). Confirm the rollout is live and testers are added.
- [ ] Privacy policy page (public URL) for the Play form.
- [ ] Run the Phase 4 test (§6). Fix the findings, release `dev` → `main`, build a new AAB, upload it.
- [ ] Optional: block `SYSTEM_ALERT_WINDOW` ("display over other apps", pulled in by a library and unused) in `android.blockedPermissions` so reviewers don't ask.
- [ ] Confirm the live database name (`POSTGRES_DB`) does **not** contain "dev". The "Clean up data" page is only allowed on databases named like dev.
- [ ] Change the test passwords used during testing. Delete leftover token files on the test laptop (`p1-test/out/.token`, `p2-test/out/.token`, any `eyJhbGci…` file in the repo folder).
- [ ] Dashboard data: fix the PARVAIZ / PERVAIZ name spelling. Check the operator phone number used for driver emergency calls on production.
- [ ] Tell the team the Android app ID must stay `tech.mercon.driver`.

---

## 6. Phase 4 test prompt (paste into a NEW chat on the laptop with the phone)

Fill in the `<ask owner>` values before pasting. Use the **test APK** (dev),
never the Play AAB.

````text
# MERCON DRIVER APP — FINAL TEST (Phase 3 retest + Phase 4 end-to-end)

## WHO YOU ARE AND WHAT THIS IS
You are the testing assistant for MERCON, a trucking/logistics platform in Saudi Arabia. It has three parts:
- Web dashboard (used by office staff: Admin and Operator roles) — dev: https://dev.mercon.tech
- API server — dev: https://dev.mercon.tech/api
- Driver Android app (package tech.mercon.driver, built with Expo). Drivers log in with phone + password, receive trips, run the trip step by step, take photos, share GPS during the trip, press SOS, and see their earnings, documents and notifications.

Earlier rounds:
- Phase 1: notifications + GPS
- Phase 2: full trips, delays, change driver
- Phase 3: profile, settings, driver's own pages; 13 problems, all fixed since
This chat does the FINAL round:
- Part A: confirm the Phase 3 fixes.
- Part B (Phase 4): check that the dashboard and the app show the same data and sync both ways quickly.

The phone is a real Realme RMX2030 (Android 10), connected to this laptop by USB with adb.

## YOUR ROLE — STRICT
- You only TEST and REPORT. Do NOT change code. Do NOT commit, push, open PRs or touch git branches.
- To read source: github.com/aprodac/MERCON, branch `dev`, read only.
- You may run terminal commands (adb, curl, node, PowerShell/bash) and install the APK on the phone.
- Ask the owner before anything that affects a real person: calling a number, messaging someone, or assigning a trip to a driver other than the test driver.
- Write all times in IST (UTC+5:30).
- Explain results in plain English; the owner is not a programmer.

## SAFETY RULES
- DEV ONLY. Never call https://mercon.tech or https://mercon.tech/api (PRODUCTION, real drivers).
- Dev holds REAL data. You may READ anything; only CREATE or CHANGE trips for the test driver below.
- Never edit or delete other drivers, customers, vehicles, invoices or users.
- Put "P4 TEST" in the stop names of every trip you create. Cancel any still open at the end.
- Keep login tokens only inside p4-test/out/ and delete them at the end. Never print tokens or passwords in the report.

## ACCOUNTS AND IDS
- Operator (dashboard/API): username <ask owner>, password <ask owner>
  - Log in: POST https://dev.mercon.tech/api/auth/login, body {"username":"...","password":"..."}
  - Use the returned token as `Authorization: Bearer <token>`.
- Test driver: CHAUDHRY SHAHBAZ
  - driver id d0328e55-0f27-40a1-826b-d193b21f4f4b
  - app login: phone 510785259, password <ask owner>

## USEFUL API CALLS (dev, operator token)
- Driver:
  - GET  /api/drivers/<driverId>
  - GET  /api/drivers/<driverId>/phone   → phone(s), notifications sent, push delivery status
  - GET  /api/drivers/payouts
- Customers: GET /api/customers  → pick a real customer id for test trips
- Trips:
  - GET   /api/trips
  - GET   /api/trips/:id
  - POST  /api/trips  → create. Example body:
    {"customer_id":"<id>","driver_id":"<driverId>","planned_start":"<ISO, a few minutes in the future>","planned_end":"<ISO, +6h>","billing_amount":1,"driver_charge":1,
     "stops":[{"stop_type":"Pickup","leg_index":0,"lat":24.7136,"lng":46.6753,"location_name":"P4 TEST pickup","planned_arrival":"<start>"},
              {"stop_type":"Dropoff","leg_index":0,"lat":24.80,"lng":46.75,"location_name":"P4 TEST drop","planned_arrival":"<end>"}]}
    Dev REFUSES a planned_start in the past.
  - POST  /api/trips/:id/dispatch        {"driver_id":"..."}
  - POST  /api/trips/:id/replace-driver  {"new_driver_id":"...","reason":"P4 test"}
  - PATCH /api/trips/:id/status          {"status":"Cancelled","reason":"P4 test"}
- Push test: POST /api/drivers/<driverId>/test-push
- If an endpoint differs, look in backend/api-server/src/routes/ on dev, adapt and continue.

## PHONE SETUP
1. Check the phone with `adb devices`.
2. Install the test APK (dev):
   - Link: https://expo.dev/artifacts/eas/eRiXQcu6W_R3jHqvnn4OpGimDsdlhf_7bhGyfn6prLU.apk (or the newest preview build the owner gives you)
   - `adb install -r <file>`. If the signature doesn't match, run `adb uninstall tech.mercon.driver` first.
3. Check the version: `adb shell dumpsys package tech.mercon.driver | grep -E "versionName|versionCode"`
4. Tools:
   - screenshots: `adb exec-out screencap -p > p4-test/out/<id>.png`
   - screen text: `adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml p4-test/out/`
   - input: `adb shell input tap/text/keyevent`
   - logs: `adb logcat`
5. Evidence goes in p4-test/out/.

## PART A — RETEST OF PHASE 3 FIXES (each should PASS)
A1  Change password:
    - a WRONG current password → a clear "current password is incorrect" message; no logout, no crash
    - change it to a temporary password and log in; change it back and log in again
A2  Text fields are NOT forced to capitals (password, notes, search).
A3  Profile / performance stats show real numbers that match the server's trip counts.
A4  Documents:
    - the list opens and each file opens (signed links /uploads/s/<expiry>/<signature>/<file>)
    - extra: remove "/s/<expiry>/<signature>" from a link and open it with curl → expect 403
A5  Vehicle section shows plate + type. With no vehicle, it shows a sensible message, never blank or "undefined".
A6  Help & Support: the call / WhatsApp buttons open the dialer or WhatsApp with a number. Do NOT call or send.
A7  The notifications bell lists notifications. No message contains "[stop:...]".
A8  Forgot password with the test phone names the driver or shows a clear message. Do NOT complete a reset.
A9  Settings: NO Dark Mode option, and the version shows 1.2.0.
A10 Payouts / earnings do NOT count cancelled trips.
A11 History tab ("History"; Urdu تاریخچہ):
    - dates are correct
    - cancelled trips show a grey "Cancelled" pill with "—" as the charge
A12 Large text:
    - run `adb shell settings put system font_scale 1.3`
    - check Home, Trips, Trip details, Profile and Settings for cut-off or overlapping text (screenshots)
    - reset to 1.0
A13 SOS with NO active trip reaches the office. Say where you found the alert.
A14 Urdu: the layout flips right-to-left on Home, Trips, Trip details, Profile and Settings; labels are translated; nothing overlaps. Switch back to English.
A15 Phone setup guide:
    - log out, run `adb shell pm clear tech.mercon.driver`, log in
    - "Set up your phone for trips" opens by itself with 3 steps and a progress bar:
      - notifications
      - location
      - maker background step (Realme: "Allow background activity" + "Allow auto startup")
    - tap "Later": the guide closes and an orange "Finish phone setup" button shows above the bottom bar
    - close and reopen the app: the full guide must NOT open by itself again; only the button shows
    - tap the button: the guide opens; do each step; the guide and the button disappear when all are done; it never loops or flickers

## PART B — PHASE 4: DASHBOARD vs APP
For every check, write down the app value, the dashboard/API value, and the seconds it took to sync.
B1  Profile: name, phone, licence number + expiry, ID/nationality, vehicle plate. App vs GET /api/drivers/<id>.
B2  Trips:
    - the trip count in each app tab vs the dashboard data
    - for 3 trips, compare ref ID, status, customer, pickup/drop, planned times (watch for timezone shifts) and driver charge
B3  Phone LOCKED, create + assign a P4 TEST trip:
    - measure the seconds until the notification shows
    - open the trip; its details must match the API
B4  Accept → Start → Arrived pickup → Loading done / depart → Arrived drop → Complete, with photos when asked.
    After each tap, note the seconds until the API matches. The photos and stop times must be on the server.
B5  Live GPS while in transit:
    - Google Maps open for 3 min, then screen locked for 3 min
    - the newest server location point must keep updating every minute
    - "MERCON is sharing your trip location" is visible throughout
    - after Complete, the notification disappears and points stop
B6  Office cancels a started P4 TEST trip. Expected:
    - a "cancelled" notification within seconds
    - the trip leaves the active screen
    - GPS stops
    - it shows in History as "Cancelled"
B7  Office changes driver:
    - ASK THE OWNER which other driver is safe to use
    - Shahbaz's phone says the trip was reassigned, the trip disappears, GPS stops
    - cancel that trip right after
B8  Delay:
    - create a P4 TEST trip starting in 5 minutes; do NOT start it; wait ~35–40 min (do other checks meanwhile)
    - expected: the trip is marked Delayed; the office gets "... is X late leaving <pickup>"; the driver gets ONE reminder, not one every minute
    - start the trip in the app; it must not jump back to "Scheduled"
    - cancel it at the end
B9  Notifications: app list vs GET /api/drivers/<id>/phone.
    - same items
    - push "Delivered"
    - the device row shows phone model, app version and permissions (not blank)
B10 Earnings: app totals vs the dashboard (GET /api/drivers/payouts and the driver page). Cancelled trips count on neither side.
B11 Offline: airplane mode for 2 min during a trip, then off.
    - the offline points upload afterwards
    - no error screens, and the trip is not lost

## FINAL REPORT (paste-ready, plain English)
1. Table: ID | PASS / FAIL / BLOCKED | Expected | What I saw | Evidence (file / API result / IST time) | Sync delay (s)
2. FAIL list, worst first, with exact steps to reproduce.
3. The P4 TEST trips created (ref IDs), each Completed or Cancelled.
4. Clean-up:
   - font scale 1.0
   - language English
   - the driver password back to the original
   - token files deleted
5. Anything odd you noticed.
````

When the report comes back: check each FAIL against the dev server before
fixing it. Fix on a branch from `dev`, open a PR into `dev`, build a new test
APK (`preview` from `dev`), and retest only the failed items. Then release
`dev` → `main` and build + upload a new AAB (§3–§4).
