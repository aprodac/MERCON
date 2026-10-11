# Driver app — how to ship an update to Play

The first Play release (version 1.2.0, version code 3, built from `main`
`6f1356e`) was uploaded to **Internal testing** on 5 Oct 2026. Every later
change reaches phones this way. Background and rules: `docs/DRIVER_APP_HANDOVER.md`.

## Does this change need a new app file?

| Change | New Play file? |
|---|---|
| Server / dashboard only (notification logic, delay alerts, reports, dashboard pages, API fixes) | **No.** Release `dev` → `main` (`docs/RELEASE_PROCESS.md`); the app picks it up. |
| Driver app screens, buttons, text, translations, app behaviour (`frontend/mobile-app/driver-app`, `frontend/mobile-app/shared`) | **Yes.** Follow the steps below. |

The app has no over-the-air (Expo Updates) set up yet, so every app change needs a new file.

## Steps

### 1. Fix and test on dev
- Make the change on a branch from `dev` and merge it into `dev` with a PR.
- Build a **test APK**: GitHub → Actions → **Mobile Build (EAS)** → Run workflow →
  branch `dev`, app `driver`, platform `android`, profile **`preview`**.
- Install it on a phone (`adb install -r app.apk`) and check the fix against
  the dev server. Never test on production.

### 2. Release the server
- PR `dev` → `main`, then merge. This updates mercon.tech
  (`docs/RELEASE_PROCESS.md`).
- Do this **before** the app, because the new app may need the new server code.

### 3. Build the Play file
- GitHub → Actions → **Mobile Build (EAS)** → Run workflow → branch **`main`**,
  app `driver`, platform `android`, profile **`production`**.
- Or: `gh api repos/aprodac/MERCON/actions/workflows/eas-build.yml/dispatches -f ref=main -f "inputs[app]=driver" -f "inputs[platform]=android" -f "inputs[profile]=production"`
- Ready in ~20 min at https://expo.dev → account alan32 → MERCON Driver → Builds.
- The version code goes up by itself (3 → 4 → 5…). The visible version (1.2.0)
  only changes with `npm run version:bump -- patch|minor` in `driver-app`
  (commit `version.json`).

### 4. Check the file before uploading

The Windows laptop commands (PowerShell, Java/Android Studio installed):
```powershell
keytool -printcert -jarfile "C:\path\to\application-<build-id>.aab"
# SHA1 must be E9:F7:09:B1:EC:A2:5C:39:AF:96:9D:73:1E:B1:D9:DD:1D:1C:BD:44
```
On Linux/macOS, also check the app ID and server:
```
unzip -p app.aab base/manifest/AndroidManifest.xml | strings | grep -m1 tech.mercon.driver
unzip -p app.aab base/assets/app.config | grep -o 'https://[a-z.]*mercon.tech/api'   # must be https://mercon.tech/api
```
Also check that the EAS build page shows profile `production` and the expected `main` commit.
**If the SHA-1 is different, do not upload.** The key must never change (handover §2).

### 5. Upload to Play
1. Play Console → MERCON Driver → Test and release → Testing → **Internal testing**
   → **Create new release**.
2. Upload the `.aab`. A row "N (1.2.x)" appears.
3. Release name: leave the suggested one.
4. Release notes: the app's default language is **en-GB**:
   ```
   <en-GB>
   What changed, in one or two short lines.
   </en-GB>
   ```
5. **Next**, then check **Preview and confirm**:
   - Red errors block; fix them first.
   - The warning "There is no deobfuscation file…" is expected and safe to
     ignore (the code isn't obfuscated).
6. **Save and publish.**

Testers already on the list get it as a normal Play Store update; no new link
is needed. To add testers: Internal testing → **Testers** tab → email list →
share the **Join on the web** link.

### Common upload errors

| Message | Fix |
|---|---|
| Version code N has already been used | Build again (step 3). The code goes up by itself. |
| Signed with the wrong key | The file wasn't built by EAS with the default keystore. Rebuild on EAS; never Codemagic or a local build. |
| App content / declarations incomplete | Fill in the forms with the text in `docs/ANDROID_PLAY_RELEASE.md` §4. |

## Later improvements (optional)

- **Automatic upload:** store a Google Play service-account JSON key **only in
  Expo** (never in chat or git). `eas submit` / the build workflow can then put
  each production build on Internal testing by itself.
- **Expo Updates (over-the-air):** small screen and text fixes can reach phones
  in minutes without a Play upload. Native changes (permissions, new native
  libraries, app.config changes) still need a Play file. Setting it up needs one
  normal Play release first.
