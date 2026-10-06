# iOS builds without a Mac — Xcode Cloud + GitHub Actions

**Goal:** anyone on the team (Windows is fine) can build Mercon Driver / Mercon Operator for
iPhone and send it to TestFlight (internal and external testers) from GitHub, without
waiting for the Mac.

```
GitHub → Actions → "iOS Build (Xcode Cloud)" → Run workflow (pick branch + app)
   │  .github/scripts/xcode-cloud-build.mjs → App Store Connect API: start build
   ▼
Xcode Cloud (Apple's Macs)
   ci_post_clone.sh  → Node + CocoaPods, npm ci, API by branch, expo prebuild --clean, pod install,
                     Swift packages resolved (operator: MapLibre → Package.resolved)
   Archive           → signed by Apple (cloud signing, no certificates to manage)
   ci_post_xcodebuild.sh → "What to Test" notes from the last commits
   Post-actions      → TestFlight internal group + external group
   ▼
GitHub job shows ✅ / ❌ (when "wait" is ticked)
```

| What | Where |
|---|---|
| GitHub workflow | `.github/workflows/ios-xcode-cloud.yml` |
| API script (start + wait) | `.github/scripts/xcode-cloud-build.mjs` |
| Xcode Cloud scripts (per app) | `frontend/mobile-app/<app>/ios/ci_scripts/` → call `shared/tooling/xcode-cloud/` |
| Cost | Included in the Apple Developer Program: 25 compute hours / month. One build ≈ 20–35 min. |

**Branch → API:** `main` → `https://mercon.tech/api`, anything else → `https://dev.mercon.tech/api`
(same as Codemagic). **Build number:** set by Xcode Cloud, always going up.
**Version** (1.2.0 etc.): still from the app's `version.json` — bump it with
`npm run version:bump -- patch` (works on Windows; `ios/` changes it makes don't matter,
Xcode Cloud regenerates `ios/`).

### Why `ios/` is now in git
Xcode Cloud only builds a project it can find in the repo, and its scripts must sit next to the
project (`ios/ci_scripts/`). So each app's `ios/` folder is committed (Pods and build output
are still ignored by `ios/.gitignore`). It is still **generated**: Xcode Cloud throws it away
and runs `expo prebuild --clean` before every build, so a stale `ios/` can never ship. Never
edit files in `ios/` by hand — only `ios/ci_scripts/` is hand-written. If a local
`expo prebuild` changes files in `ios/`, committing them is fine but not required.

---

## One-time setup (Hysam, on the Mac — about 30–45 min, done once)

### 1. GitHub access for Xcode Cloud
The repo `aprodac/MERCON` belongs to a GitHub organization, so an **org owner** must approve
Apple's "Xcode Cloud" GitHub app when Xcode asks (step 2). If you're not an owner, have one
ready.

### 2. Create the workflow — driver app
1. Pull the branch that has this setup (`dev` once merged) so `ios/ci_scripts/` exists locally.
2. Open `frontend/mobile-app/driver-app/ios/MerconDriver.xcworkspace` in Xcode.
3. **Integrate → Create Workflow…** (or Report navigator ⌘9 → **Cloud** → Get Started).
   Product: **MerconDriver**, app: *Mercon Driver* (`tech.merconapp.driver`). Grant access to
   the GitHub repo when asked.
4. Edit the workflow:
   - **Name:** exactly `TestFlight` (the GitHub workflow looks it up by this name).
   - **Environment:** Xcode = *Latest Release*, macOS = *Latest*. Nothing under environment
     variables.
   - **Start Conditions:** delete the default *Branch Changes* condition (it would build on
     every push and burn the 25 hours). Add **Manual Start Condition → Branch → Any branch**.
   - **Actions:** **Archive — iOS**, scheme `MerconDriver`, Deployment Preparation:
     **TestFlight and App Store**.
   - **Post-Actions:**
     - **TestFlight Internal Testing** → pick the internal group.
     - **TestFlight External Testing** → pick (or first create in App Store Connect) the
       external group, e.g. `Drivers — pilot`.
5. Save. Xcode offers to start a build — let it, this is the first test.

### 3. Same for the operator app
`frontend/mobile-app/operator-app/ios/MerconOperator.xcworkspace`, product **MerconOperator**,
scheme `MerconOperator`, workflow name `TestFlight`, same settings. The Notification Service
extension (`tech.mercon.operator.NotificationService`) is signed automatically by Xcode Cloud;
its App ID needs the same capabilities as in `docs/IOS_DISTRIBUTION_AND_PUSH.md` (A1, and
**Communication Notifications** on `tech.mercon.operator`).

### 4. Starting build number
App Store Connect → Apps → each app → **Xcode Cloud → Settings → Build Number** → set
**Next Build Number** to **110** (anything above the last upload — both apps are at 103 in
`version.json`).

### 5. API key for GitHub
App Store Connect → **Users and Access → Integrations → App Store Connect API → Team Keys →
+** → name `GitHub Actions`, access **App Manager** → Generate → **download the `.p8`** (only
once; keep it in the password manager). Note the **Key ID** and the **Issuer ID** (top of
that page).

GitHub → `aprodac/MERCON` → **Settings → Secrets and variables → Actions → New repository
secret**:

| Secret | Value |
|---|---|
| `ASC_KEY_ID` | the Key ID, e.g. `2X9R4HXF34` |
| `ASC_ISSUER_ID` | the Issuer ID (a UUID) |
| `ASC_PRIVATE_KEY` | the whole `.p8` file, including the `-----BEGIN PRIVATE KEY-----` lines |

Optional variable `XCODE_CLOUD_WORKFLOW` if the Xcode Cloud workflow is not named `TestFlight`.

### 6. External testing — Apple's side
- The external group needs **Test Information** filled once (App Store Connect → TestFlight →
  Test Information): what to test, contact email, and a demo login for Apple's reviewer
  (driver: phone + licence number; operator: username + password).
- The **first build of each new version** (e.g. 1.2.0 → 1.2.1) goes through Beta App Review
  (usually < 24 h). Later builds of the same version usually go out automatically.
- Answer export compliance once if asked (the apps set `ITSAppUsesNonExemptEncryption: false`).

---

## Everyday use (anyone, any computer)

1. Merge/push your code to the branch you want to build (`dev` for testers, `main` for
   production API).
2. GitHub → **Actions → iOS Build (Xcode Cloud) → Run workflow** → *Use workflow from*:
   the branch → app: `driver` / `operator` / `both` → Run.
   Or: `gh workflow run ios-xcode-cloud.yml --ref dev -f app=driver`
3. Leave **wait** ticked to see ✅/❌ in GitHub (~30 min). Then ~10–30 min for Apple to
   process it, and testers get the TestFlight update.

Logs of a failed build: App Store Connect → Apps → the app → **Xcode Cloud** → the build →
the failing step (needs an App Store Connect account; the GitHub job prints the build number).

## Troubleshooting

| Error (GitHub job or Xcode Cloud) | Fix |
|---|---|
| `Missing ASC_KEY_ID` / `401 … credentials` | Secrets in step 5; `ASC_PRIVATE_KEY` must be the full `.p8` text |
| `No Xcode Cloud product for tech.…` | Workflow not created yet for that app (steps 2–3) |
| `no Xcode Cloud workflow named "TestFlight"` | Rename the workflow, or set the `XCODE_CLOUD_WORKFLOW` variable |
| `Xcode Cloud can't see branch` | Push the branch; check Xcode Cloud still has GitHub access |
| Build doesn't start for the branch | Workflow start conditions — needs a *Manual Start Condition* for that branch (step 2.4) |
| `ci_post_clone.sh` fails at `npm ci` | `frontend/mobile-app/package-lock.json` out of date — run `npm install` there and commit |
| Operator build fails resolving Swift packages / `Package.resolved` missing | `post-clone.sh` regenerates it after `pod install` — check the "Swift packages: resolve" step in the Xcode Cloud log; keep `MerconOperator.xcworkspace/xcshareddata/swiftpm/Package.resolved` committed |
| Signing error about `aps-environment` / capabilities | App ID capabilities — `docs/IOS_DISTRIBUTION_AND_PUSH.md` A1/A2 |
| `The bundle version must be higher` | Raise *Next Build Number* (step 4) |
| Out of compute hours | App Store Connect → Xcode Cloud → Usage; hours reset monthly |

The Mac/Xcode route in `docs/IOS_DISTRIBUTION_AND_PUSH.md` (Part C) still works as a fallback.
