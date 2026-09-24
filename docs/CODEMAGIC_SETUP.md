# Codemagic setup — Mercon Driver & Mercon Operator

Builds are defined in `codemagic.yaml` (repo root). This page covers the
one-time setup in the Codemagic web UI, which needs your accounts.

| Workflow | Output |
|---|---|
| `driver-android` | Mercon Driver APK (install on phones) + AAB (Play Store) |
| `operator-android` | Mercon Operator APK + AAB |
| `driver-ios` | Mercon Driver IPA, uploaded to TestFlight |
| `operator-ios` | Mercon Operator IPA, uploaded to TestFlight |

All workflows run on `mac_mini_m2` machines and are started by hand.

## 1. Connect the repository

1. Sign in at https://codemagic.io with GitHub.
2. **Add application** → GitHub → `aprodac/MERCON` → project type **React Native App**.
3. Codemagic reads `codemagic.yaml` from the branch you build. It exists on
   `dev` (and any branch merged from it).

## 2. Android signing (needed before the first Android build)

Each app needs its own upload keystore. Generate them on your laptop
(`keytool` ships with any JDK; it asks for a password — pick a strong one and
save it in your password manager):

```bash
keytool -genkeypair -v -keystore mercon-driver.jks -alias mercon-driver -keyalg RSA -keysize 2048 -validity 10000
keytool -genkeypair -v -keystore mercon-operator.jks -alias mercon-operator -keyalg RSA -keysize 2048 -validity 10000
```

Upload them in Codemagic: **Team settings → Code signing identities →
Android keystores → Add keystore**. Use these **exact reference names**
(`codemagic.yaml` points at them):

| Reference name | File | Alias |
|---|---|---|
| `mercon_driver_keystore` | `mercon-driver.jks` | `mercon-driver` |
| `mercon_operator_keystore` | `mercon-operator.jks` | `mercon-operator` |

⚠️ **Never commit the `.jks` files or passwords to git**, and back them up.
When you publish on Google Play, enable **Play App Signing** so a lost upload
key can be reset; without it, a lost key means you can never update the app.

How it works: `frontend/mobile-app/shared/tooling/with-release-signing.js`
(an Expo config plugin) makes release builds use the keystore whenever
Codemagic provides it (`CM_KEYSTORE_*` variables). Local builds are unchanged.

## 3. iOS signing + TestFlight (needed before the first iOS build)

Needs an **Apple Developer Program** membership.

1. In **App Store Connect → Users and Access → Integrations → App Store Connect API**,
   create a key with **App Manager** access. Download the `.p8` file (only once!)
   and note the Issuer ID and Key ID.
2. In Codemagic: **Team settings → Integrations → Developer Portal → Manage keys**
   → add the key with the name **`mercon_app_store_connect`** (must match
   `codemagic.yaml`).
3. In App Store Connect create the two apps (bundle IDs `tech.mercon.driver`
   and `tech.mercon.operator` — register them under Certificates, Identifiers
   & Profiles first if they don't appear).
4. In Codemagic: **Team settings → Code signing identities → iOS certificates**
   → generate (or upload) an **Apple Distribution** certificate. Provisioning
   profiles are fetched automatically for the bundle IDs above.

## 4. Build

Codemagic → the MERCON app → **Start new build** → pick the branch (`dev`) and
the workflow. When it finishes, download the APK/AAB from the build's
**Artifacts**; iOS builds appear in TestFlight.

Each build uses Codemagic's `BUILD_NUMBER` as the Android `versionCode` /
iOS `buildNumber`, so a new build always installs over the previous one.

## Settings you may want to change in `codemagic.yaml`

- **API per branch** (automatic, first step of every workflow):

  | Branch built | API |
  |---|---|
  | `main` | `https://mercon.tech/api` (production) |
  | `dev` or any other branch | `https://dev.mercon.tech/api` |

  To force a different API for one build, add the variable
  `EXPO_PUBLIC_API_URL` in Codemagic's **Start new build** dialog.
- Email notifications — add under a workflow:
  ```yaml
  publishing:
    email:
      recipients: [you@example.com]
  ```

## Not covered yet

- **Push notifications (driver app):** Android push needs a Firebase project
  with an Android app for `tech.mercon.driver` (its `google-services.json` and
  the FCM setup Expo push uses); iOS push needs an APNs key. Until then, builds
  work but drivers get no push notifications.
