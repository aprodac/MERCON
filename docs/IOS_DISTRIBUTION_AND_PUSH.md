# iOS distribution + push notifications — setup checklist

**For:** whoever owns the Apple Developer / App Store Connect / Expo accounts (Hysam).
**Apps:** Mercon Driver (`tech.mercon.driver`) and Mercon Operator (`tech.mercon.operator`).
**Builds:** from **Hysam's Mac with Xcode** (Part C). Codemagic (`codemagic.yaml` →
`driver-ios`, `operator-ios`) can do the same in the cloud later — see Part C-alt and
`docs/CODEMAGIC_SETUP.md` §3.

Order: **A** (Apple Developer) → **B** (Expo push key) → **C** (build + upload on the Mac) →
**TestFlight** → **D** (test pushes).

## How push works in this project (read once)

```
Driver app on iPhone ──(asks permission)──▶ Expo push token "ExponentPushToken[…]"
        │  POST /mobile/devices  (saved in DriverDevice)
        ▼
MERCON API ──▶ Expo push service (exp.host) ──▶ Apple APNs ──▶ iPhone
```

- The **backend** sends pushes through Expo (`backend/api-server/src/services/pushNotificationService.ts`)
  — on trip assignment, trip changes, delay alerts and operator messages to drivers.
- **Expo needs an APNs key** from our Apple account to hand pushes to Apple. The app being
  built by Codemagic (not EAS) doesn't change that.
- **Only the driver app has push today.** The operator app has none yet (needs its own
  Expo project + backend work — see the end).

---

## Part A — Apple Developer (developer.apple.com)

### A1. Turn on Push Notifications for the App IDs
Certificates, Identifiers & Profiles → **Identifiers**:
1. Open `tech.mercon.driver` → **Capabilities** → tick **Push Notifications** → **Save**.
2. Do the same for `tech.mercon.operator` (not used yet, but saves a re-sign later).

If an identifier doesn't exist yet, create it (App IDs → App, explicit bundle ID) with
Push Notifications ticked.

### A2. Make the App Store provisioning profiles pick up push
Profiles made *before* A1 don't include push, and a build signed with them either fails or
gets no pushes.
- Certificates, Identifiers & Profiles → **Profiles** → delete (or **Edit → Save** to
  regenerate) any existing **App Store** profiles for `tech.mercon.driver` and
  `tech.mercon.operator`.
- With **Automatically manage signing** in Xcode (Part C5) Xcode then creates a fresh profile
  that includes push. (Codemagic does the same through its API integration.)

### A3. Create one APNs Auth Key (.p8)
Certificates, Identifiers & Profiles → **Keys** → **+**:
1. Name: `MERCON APNs`, tick **Apple Push Notifications service (APNs)** → Continue → Register.
2. **Download the `.p8` now — Apple only lets you download it once.** Store it in the team
   password manager.
3. Note the **Key ID** (on the key page) and the **Team ID** (top-right of the developer
   site / Membership page).

One key works for **every** app in the team, for both TestFlight and App Store (it is not
tied to a bundle ID or to development/production).

---

## Part B — Expo (expo.dev) — give Expo the APNs key

The driver app's Expo project is `2697c85a-0ac8-4a2e-9225-5cc84a5b518d`
(`frontend/mobile-app/driver-app/app.config.ts` → `extra.eas.projectId`), owned by the Expo
account `alan32`. You need to be a member of that account (or have its owner do this).

Either:
- **expo.dev** → the driver project → **Credentials** → iOS → `tech.mercon.driver` →
  **Push Notifications** → **Add a Push Key** → upload the `.p8`, enter Key ID + Team ID.

Or, from a terminal (no Mac needed):
```bash
cd frontend/mobile-app/driver-app
npx eas-cli login
npx eas-cli credentials   # iOS → production → Push Notifications: Manage your Apple Push Notifications Key → Add
```

Check: the project's Credentials page shows a push key for `tech.mercon.driver`.

---

## Part C — Build and upload from the Mac (Xcode)

### C1. One-time setup on the Mac
- **Xcode** (latest, from the Mac App Store) — open it once and let it install components.
  Then `xcode-select --install` for the command-line tools.
- **Node 22** (`brew install node@22` or nvm) and **CocoaPods** (`brew install cocoapods`).
- **Xcode → Settings → Accounts → +** → sign in with the Apple ID that belongs to the MERCON
  team (Admin or App Manager role). Select the team → **Manage Certificates → + → Apple
  Distribution** if there isn't one yet.
- **App Store Connect → Apps → +** → create the app records if they don't exist:
  *Mercon Driver* (`tech.mercon.driver`) and *Mercon Operator* (`tech.mercon.operator`).

### C2. Get the code and install
```bash
git clone https://github.com/aprodac/MERCON.git && cd MERCON
git checkout dev                 # or main for a production build
cd frontend/mobile-app
npm ci                           # installs both apps + shared code (one workspace)
```

### C3. Tell the build which API and push mode to use
Create **`frontend/mobile-app/driver-app/.env.local`** (git-ignored; Expo reads it during
prebuild *and* when Xcode bundles the JavaScript):
```bash
# dev testers → dev API. For a production build use https://mercon.tech/api
EXPO_PUBLIC_API_URL=https://dev.mercon.tech/api
# TestFlight / App Store use Apple's production push servers
APS_ENVIRONMENT=production
```
(For the operator app, the same file in `operator-app/` with just `EXPO_PUBLIC_API_URL`.)

### C4. Generate the iOS project
```bash
cd driver-app                     # or operator-app
npx expo prebuild --platform ios --clean
cd ios && pod install && cd ..
```
The `ios/` folder is generated (git-ignored) — regenerate it with `--clean` whenever you pull
new code or change `app.config.ts`. Don't edit files inside `ios/` by hand; changes are lost.

Check the push setting landed: `ios/<AppName>/<AppName>.entitlements` should contain
`aps-environment` = **production**.

### C5. Sign, archive, upload
```bash
open ios/*.xcworkspace            # the .xcworkspace, not the .xcodeproj
```
In Xcode:
1. Select the app target → **Signing & Capabilities** → tick **Automatically manage signing**
   → **Team** = the MERCON team. The Bundle Identifier must stay `tech.mercon.driver`
   (or `tech.mercon.operator`). **Push Notifications** should be listed under capabilities
   (driver app).
2. **General** → bump **Build** (e.g. 2, 3, …) for every upload — App Store Connect rejects a
   repeated build number for the same version. Change **Version** (`1.0.0`) only for a new release.
3. Top bar device selector → **Any iOS Device (arm64)**.
4. **Product → Archive** (a few minutes). The Organizer opens when it's done.
5. Organizer → the new archive → **Distribute App → App Store Connect → Upload** → keep the
   defaults (automatic signing) → **Upload**.

Command-line alternative (same result):
```bash
xcodebuild -workspace ios/*.xcworkspace -scheme <AppName> -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/App.xcarchive -allowProvisioningUpdates archive
# then Organizer → Distribute, or xcodebuild -exportArchive with an ExportOptions.plist (method app-store-connect)
```

### C6. Common Mac build errors
| Error | Fix |
|---|---|
| `No profiles for 'tech.mercon.driver' were found` | Signing & Capabilities → pick the Team; Xcode creates the profile (needs A1 done) |
| `Provisioning profile … doesn't include the aps-environment entitlement` | Push not enabled on the App ID (A1), or an old profile — Xcode → Settings → Accounts → Download Manual Profiles / delete old profile (A2) |
| `pod install` fails | `cd ios && pod repo update && pod install` |
| App opens but talks to the wrong server | `.env.local` missing or wrong `EXPO_PUBLIC_API_URL` → fix, then `npx expo prebuild --platform ios --clean` and archive again |
| `The bundle version must be higher` on upload | Bump **Build** (C5 step 2) |

### C-alt. Codemagic instead of the Mac
Codemagic's `driver-ios` / `operator-ios` workflows do C2–C5 in the cloud (setup in
`docs/CODEMAGIC_SETUP.md` §3). They already set `APS_ENVIRONMENT=production` and pick the API
from the branch (`main` → production, anything else → dev).

## TestFlight
After upload, the build appears in **App Store Connect → the app → TestFlight** once Apple has
processed it (~10–30 min). Answer the **export compliance** question if asked (the app sets
`ITSAppUsesNonExemptEncryption: false`, so usually none).

### External testers (people outside the team)
App Store Connect → the app → **TestFlight**:
1. **External Testing** → **+** create a group (e.g. `Drivers — pilot`).
2. Add the build to the group → fill **Test Information** (what to test, a contact email,
   and a **demo driver login** — phone + licence number — for Apple's reviewer).
3. Submit for **Beta App Review** (first build of a version: usually < 24 h; later builds of
   the same version are often automatic).
4. Add testers by email or turn on a **public link**. Testers install **TestFlight** from the
   App Store and open the invite.

Internal testers (App Store Connect users on the team) don't need Beta App Review.

---

## Part D — Test that pushes arrive

1. Install the TestFlight build on a **real iPhone** (simulators don't get pushes).
2. Log in as a driver → tap **Allow** on the notifications prompt.
   (Denied earlier? Settings → Mercon Driver → Notifications → Allow.)
3. Check the token was saved — in the database, table `DriverDevice`, that driver has a row
   whose `token` starts with `ExponentPushToken[` and `isActive = true`.
4. Send a test: **expo.dev/notifications** → paste the token → Send. It should appear on the
   phone within seconds (lock the phone to see it as a banner).
5. Real flow: assign that driver to a trip on the web dashboard → a push arrives.

### If nothing arrives
| Symptom | Cause | Fix |
|---|---|---|
| No `DriverDevice` row | Permission denied, or the app couldn't get a token | Check phone settings; make sure the build is from after A1/A2 |
| Expo test tool says `InvalidCredentials` | Expo has no (or a wrong) APNs key | Part B |
| Backend log `[PushService] Push ticket error` … `DeviceNotRegistered` | App reinstalled / token stale | Log out and in again |
| Build fails at signing with an entitlement / profile mismatch | Old profile without push | A2 (delete the profile, rebuild) — see C6 |
| Works on Android, not iPhone | Almost always Part B | Upload the APNs key |

---

## Android (for completeness)

Expo push on Android needs **FCM**: a Firebase project with an Android app for
`tech.mercon.driver`, its `google-services.json` referenced in the app config, and the FCM
v1 service-account key uploaded to the same Expo project (expo.dev → Credentials →
Android → FCM V1). Not set up yet.

## Operator app — push not built yet

The operator app has no push code. To add it later: run `eas init` in
`frontend/mobile-app/operator-app` (creates its Expo project; put the `projectId` in its
`app.config.ts`), upload the **same** APNs key to that project (Part B), and the backend
needs a device table for operators (a schema change — needs owner approval) plus the events
that should push (emergencies, delays, photos to send). Parts A1–A3 above already cover the
Apple side for `tech.mercon.operator`.
