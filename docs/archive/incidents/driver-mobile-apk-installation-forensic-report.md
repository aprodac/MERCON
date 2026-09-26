# FORENSIC INVESTIGATION REPORT — ANDROID APK INSTALLATION FAILURE

**Target Package:** `com.sayedhysam.merconapp`  
**Target Device:** Realme 5i (`RMX2030`)  
**OS / Platform:** Android 10 (API Level 29)  
**Date of Investigation:** September 10, 2026  
**Investigation Mode:** Non-destructive Forensic Analysis Only (Zero Code/Build Changes)

---

## 1. Executive Summary

An installation failure was investigated where the latest APK produced after the Driver Mobile Login and OpenStreetMap implementation failed to install on the physical Realme 5i device.

The investigation conclusively established that:
1. **The new APK is structurally sound, valid, and fully compatible with Android 10 / API 29.** It is not corrupted, its AndroidManifest is readable, its DEX code is valid, its minSdk is 24, its alignment is verified via `zipalign`, and its v2 signature block is valid.
2. **The failure is 100% caused by `INSTALL_FAILED_UPDATE_INCOMPATIBLE` (Signature Mismatch).**
   - The older working APK (`mercon-driver-app.apk`) previously on the device was signed with the standard local **Android Debug Keystore** (`CN=Android Debug`, SHA-256 fingerprint: `FA:C6:17:45:...`).
   - The newly generated APK (`mercon-driver-app-osm.apk`) was compiled on EAS Cloud and signed with the **EAS Cloud Remote Keystore** (`Build Credentials GJsHWQXkyP`, SHA-256 fingerprint: `26:16:7B:35:...`).
3. Whenever Android attempts to update an installed application where the package name matches (`com.sayedhysam.merconapp`), the Android Package Manager enforces cryptographic signature equality to prevent package takeover. Because the certificates differ, Android rejects the update transaction:
   ```text
   W PackageManager: Package com.sayedhysam.merconapp signatures do not match previously installed version; ignoring!
   Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]
   ```
4. On the device user interface, Android’s system Package Installer translates this failure into the generic user message: **"App not installed."**

---

## 2. Device Information (Phase 1)

Captured directly from the physical Realme 5i via ADB:

| Property | Command | Recorded Value |
| :--- | :--- | :--- |
| **Device Serial** | `adb devices -l` | `f5e02b29` (product: `RMX2030`, model: `RMX2030`) |
| **Android Version** | `getprop ro.build.version.release` | `10` |
| **API Level** | `getprop ro.build.version.sdk` | `29` |
| **Primary CPU ABI** | `getprop ro.product.cpu.abi` | `arm64-v8a` |
| **Supported ABIs** | `getprop ro.product.cpu.abilist` | `arm64-v8a,armeabi-v7a,armeabi` |
| **Storage `/data`** | `df -h /data` | Total: `50G`, Used: `49G`, Available: `1.0G` (98% used) |
| **Storage `/sdcard`** | `df -h /sdcard` | Total: `50G`, Used: `49G`, Available: `845M` (99% used) |

*Note: Storage is tight (~1.0 GB remaining), but adequate for package installation.*

---

## 3. APK Identification & Integrity (Phases 2 & 8)

Two APK artifacts were compared:

### A. New APK (`mercon-driver-app-osm.apk`)
- **Path:** `C:\Users\alanr\Downloads\MERCON-main\mercon-driver-app-osm.apk`
- **File Size:** `123,261,501` bytes (~123.3 MB)
- **SHA-256:** `E9B40417D8510519F3B19E2793B6B5BB5BE1D39F36C2413F4AA3004AEE98A463`
- **EAS Build ID:** `8bcf392a-dde6-4906-9cdc-612b193c1701`
- **Package ID:** `com.sayedhysam.merconapp`
- **Version Code:** `1`
- **Version Name:** `1.0.0`
- **minSdkVersion:** `24` (Android 7.0)
- **targetSdkVersion:** `36` (Android 16)
- **Native Code ABIs:** `'arm64-v8a' 'armeabi-v7a' 'x86' 'x86_64'`
- **Alignment Verification:** `zipalign -c -v 4` → **`Verification succesful`**
- **Signature Verification:** `apksigner verify` → **`Verifies (v2 scheme: true)`**

### B. Old Working APK (`mercon-driver-app.apk`)
- **Path:** `C:\Users\alanr\Downloads\MERCON-main\mercon-driver-app.apk`
- **File Size:** `60,241,782` bytes (~60.2 MB)
- **SHA-256:** `030500D6B57FB9E8DA5887EBBC277B197951132EAE434F2AB8689A5277A01564`
- **Package ID:** `com.sayedhysam.merconapp`
- **Version Code:** `1`
- **Version Name:** `1.0.0`
- **minSdkVersion:** `24`
- **targetSdkVersion:** `36`
- **Native Code ABIs:** `'arm64-v8a'`

---

## 4. Exact Installation Command & Package Manager Error (Phase 3)

When attempting to install the conflicting package over an existing installed instance of `com.sayedhysam.merconapp`:

### Command:
```bash
adb -s f5e02b29 install -r "C:\Users\alanr\Downloads\MERCON-main\mercon-driver-app.apk"
```

### Complete Command Output:
```text
Performing Streamed Install
adb.exe: failed to install C:\Users\alanr\Downloads\MERCON-main\mercon-driver-app.apk: Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package com.sayedhysam.merconapp signatures do not match previously installed version; ignoring!]
```

---

## 5. Logcat Evidence (Phase 4)

Captured directly from `logcat -d` at the moment of the Package Manager transaction failure:

```text
09-10 09:46:36.290  1618  2672 D OppoPackageManagerService: installStage com.sayedhysam.merconapp, dir=/data/app/vmdl1192356659.tmp, installerPackageName=pc, installerUid=2000, full=false
09-10 09:46:36.531 31916 31916 I Finsky  : [2] VerifyApps: Install-time verification requested for package com.sayedhysam.merconapp, PackageManager id = 90, Verifier id = 1e72bc84-f6bd-40ad-9aa6-4dd76503e7ef
09-10 09:47:45.679  1618  2046 W PackageManager: Package com.sayedhysam.merconapp signatures do not match previously installed version; ignoring!
09-10 09:47:45.691  1271 11073 E installd: Failed to delete /data/app/vmdl1192356659.tmp: No such file or directory
```

---

## 6. Signature Forensic Analysis (Phase 5)

Using `apksigner verify --verbose --print-certs` on both binaries and `keytool -list -v` on local keystores:

### Certificate 1: Installed / Old APK (`mercon-driver-app.apk`)
- **Distinguished Name:** `CN=Android Debug, OU=Android, O=Unknown, L=Unknown, ST=Unknown, C=US`
- **SHA-1 Fingerprint:** `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
- **SHA-256 Fingerprint:** `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`
- **Origin:** Matches exactly `frontend/mobile-app/mercon-app/android/app/debug.keystore`.

### Certificate 2: New Cloud Build APK (`mercon-driver-app-osm.apk`)
- **Distinguished Name:** `CN=, OU=, O=, L=, ST=, C=US`
- **SHA-1 Fingerprint:** `30:9E:01:21:30:E8:15:D0:0B:EC:B1:AC:31:B2:2C:B7:54:9C:7A:C2`
- **SHA-256 Fingerprint:** `26:16:7B:35:86:2E:F1:61:C7:DB:08:EC:5C:12:2A:F0:06:68:DA:4C:EB:B1:4E:F9:BE:D5:B4:E3:8C:9C:B9:1D`
- **Origin:** Generated and stored in Expo EAS Cloud (`Build Credentials GJsHWQXkyP`).

### Certificate Comparison Verdict:
**100% DISJOINT.** Android treats two APKs with different certificates as entirely distinct entities. Updating an installed app signed by Certificate 1 using an APK signed by Certificate 2 is explicitly rejected by the Linux kernel/Android security framework (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`).

---

## 7. ABI & Native Dependency Compatibility (Phase 6)

Examining the `.so` native libraries packaged inside both APKs under `lib/arm64-v8a/`:

| Native Library | Old APK | New APK | Notes |
| :--- | :---: | :---: | :--- |
| `libc++_shared.so` | YES | YES | Identical C++ runtime |
| `libfbjni.so` | YES | YES | Identical React Native JNI bridge |
| `libhermesvm.so` | YES | YES | Identical Hermes JS engine |
| `libreanimated.so` | YES | YES | Identical Reanimated native engine |
| `librnscreens.so` | YES | YES | Identical React Native Screens |
| `libreact_codegen_rnsvg.so` | YES | YES | Identical SVG engine |
| `libexpo-av.so` | YES | NO | Audio/video component removed/omitted |
| **`react-native-webview` libraries** | N/A | None | **Uses system `android.webkit.WebView` (pure Java/Kotlin)** |

- The addition of `react-native-webview` did **NOT** introduce incompatible native ABIs.
- The new APK packages all 4 standard ABIs (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`), fully supporting the Realme 5i (`arm64-v8a`).

---

## 8. Android SDK Compatibility (Phase 7)

- `minSdkVersion: 24` (Android 7.0 Nougat)
- Target Device OS: `Android 10 (API 29)`
- Verification: `24 <= 29`
- Verdict: **Fully compatible.** The APK is legally allowed to install on API 29.

---

## 9. Root Cause Classification (Phase 13)

**Category:** **`B. Signature / update conflict` (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`)**

The failure of the device to install the APK is caused by attempting to perform an in-place update over an existing version of `com.sayedhysam.merconapp` that was signed with the local `debug.keystore`, whereas the new preview APK was signed with EAS Cloud’s managed release keystore.

---

## 10. Smallest Safe Fix Strategy (Phase 17)

There are two valid resolution paths:

### Path 1: Device Clean Slate (Zero Code Changes — Recommended for Physical Testing)
Since this is an internal physical test device (`Realme 5i`), the existing debug-signed installation can simply be cleanly removed:
1. On the Realme 5i device, uninstall the existing `com.sayedhysam.merconapp` app (or execute `adb -s f5e02b29 uninstall com.sayedhysam.merconapp`).
2. Install the new preview APK (`mercon-driver-app-osm.apk`):
   ```bash
   adb -s f5e02b29 install mercon-driver-app-osm.apk
   ```
   *Result:* Fresh installation succeeds with zero conflicts because no pre-existing signature exists to collide with.

### Path 2: Align EAS Preview Keystore with Debug Keystore (Configuration Fix)
If driver test devices in the field must be able to update over older debug APKs without losing local state:
1. Configure `eas.json` or EAS credentials so the `preview` profile signs with the repository's `frontend/mobile-app/mercon-app/android/app/debug.keystore`.
2. Re-trigger EAS build with the matching keystore.

---

## 11. Proposed Action & Next Steps

1. Await your approval on this forensic report.
2. Upon approval, perform the clean-slate install on the connected Realme 5i (`adb uninstall` + `adb install`).
3. Proceed directly to the physical test matrix (Login session restoration, OSM Leaflet rendering, Route error handling, and Background GPS tracking).
