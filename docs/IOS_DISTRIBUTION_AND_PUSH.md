# iOS distribution + push notifications — setup checklist

**For:** whoever owns the Apple Developer / App Store Connect / Expo accounts (Hysam).
**Apps:** Mercon Driver (`tech.mercon.driver`) and Mercon Operator (`tech.mercon.operator`).
**Builds:** Codemagic (`codemagic.yaml` → `driver-ios`, `operator-ios`) — **no local Xcode
needed**. Codemagic runs `expo prebuild` + Xcode in the cloud, signs, and uploads to TestFlight.
Basics of the Codemagic setup (App Store Connect API key, distribution certificate) are in
`docs/CODEMAGIC_SETUP.md` §3 — do those first.

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
  regenerate) the **App Store** profiles for `tech.mercon.driver` and `tech.mercon.operator`.
- Codemagic fetches/creates profiles automatically on the next build (it uses the
  `mercon_app_store_connect` integration), so deleting is enough.

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

## Part C — Build and ship (Codemagic)

Already handled in the repo:
- `codemagic.yaml` iOS workflows set `APS_ENVIRONMENT: production`, and
  `driver-app/app.config.ts` passes it to the `expo-notifications` plugin, so the
  TestFlight/App Store build carries `aps-environment = production` (TestFlight uses Apple's
  production push servers). Local / dev-client builds keep `development`.

Steps:
1. Codemagic → **Start new build** → branch `dev` (points at `https://dev.mercon.tech/api`)
   or `main` (production API) → workflow **`driver-ios`**.
2. When it finishes, the build appears in **App Store Connect → TestFlight** after Apple's
   processing (~10–30 min). Answer the **export compliance** question if asked (the app sets
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
| Build fails at signing with an entitlement / profile mismatch | Old profile without push | A2 (delete the profile, rebuild) |
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
