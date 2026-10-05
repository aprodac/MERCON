# Driver app on Google Play — release checklist

App: **MERCON Driver**, package `tech.mercon.driver`, built with EAS (project
`2697c85a-0ac8-4a2e-9225-5cc84a5b518d`, account `alan32`).

## 1. Signing — never change it

- Every build is signed by the **EAS default keystore** ("Build Credentials
  … (default)"). Upload certificate SHA-1:
  `E9:F7:09:B1:EC:A2:5C:39:AF:96:9D:73:1E:B1:D9:DD:1D:1C:BD:44`.
- Play's upload key was reset to this certificate (active from 2026-10-03).
- Never build the store app locally (`expo run:android`, gradle,
  `eas build --local` with another keystore) and never create new EAS
  credentials — Play rejects a file signed with any other key.
- Check a file before uploading: `apksigner verify --print-certs <file>` →
  SHA-1 must be the value above.

## 2. Build

- `production` profile → AAB pointed at `https://mercon.tech/api`;
  `preview` → installable APK pointed at dev. versionCode auto-increments.
- Run: Actions → "Mobile Build (EAS)" → app `driver`, platform `android`,
  profile `production` (or `gh workflow run eas-build.yml -f app=driver
  -f platform=android -f profile=production`).
- **Release the server to production first** (`dev` → `main`,
  `docs/RELEASE_PROCESS.md`): the store app talks to mercon.tech, so the
  server must already have the endpoints the app uses.

## 3. Location — why no "Allow all the time" review

The app never asks for background location. `ACCESS_BACKGROUND_LOCATION` is
blocked in `app.config.ts` (`android.blockedPermissions`). Trip GPS outside
the app comes from a **location foreground service** started while the app is
on screen (driver taps Start Trip), with a permanent notification "MERCON is
sharing your trip location"; Android treats that as "while in use".
It stops when the trip ends or the driver logs out
(`src/services/tripLocationTask.ts`).

Location permissions in the built APK (checked on build `edc0a65a`):
`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `FOREGROUND_SERVICE`,
`FOREGROUND_SERVICE_LOCATION` (service type `location`). No
`ACCESS_BACKGROUND_LOCATION`.

## 4. Play Console forms (App content) — fill before the first review

### 4a. Foreground service permissions

Type: **Location**. Suggested text:

> MERCON Driver is used by our employed truck drivers. When a driver starts a
> delivery trip in the app, a location foreground service shares the truck's
> position with our dispatch team so they can follow the delivery, see delays
> and give customers arrival times. The service is started by the driver from
> the app, shows a permanent notification ("MERCON is sharing your trip
> location") the whole time, and stops automatically when the trip is
> completed or cancelled, or when the driver logs out. Without it, tracking
> would stop whenever the driver opens a navigation app or locks the phone.

Google may ask for a video link: record the phone from Start Trip → the
notification appears → open Google Maps → trip completed → notification gone.

### 4b. Data safety

Collected (sent to MERCON's own server, over HTTPS), not sold, not shared with
third parties for their own use. Required for drivers (the app is for
employees only).

| Data type | Why |
|---|---|
| Location — precise and approximate | App functionality: trip tracking, arrival/delay detection, proof of where photos were taken |
| Personal info — name, phone number | Account management: driver login (phone + licence/password) |
| Photos and videos | App functionality: cargo, proof-of-delivery, delay/emergency evidence (videos may contain audio — `RECORD_AUDIO`) |
| Device or other IDs | App functionality: push notification token and an app-install id, to send trip alerts to the right phone |
| App info and performance (optional to declare) | Phone status for the office: app version, notification/location permission, battery level |

Data is encrypted in transit: **yes**. Deletion: drivers ask their operator /
admin; trip photos and videos are deleted automatically 60 days after the trip
ends.

### 4c. Privacy policy

A public URL is required (any app collecting location). It must cover: what is
collected (table above), why, that location is only collected during an active
trip, retention (trip media 60 days), and a contact for deletion requests.

### 4d. Other forms

App access (give reviewers a working **test driver login** on production with
a sample trip, or Google cannot review the app), Ads (none), Content rating,
Target audience (adults, not for children), News app (no).

## 5. Before uploading — open questions

- `SYSTEM_ALERT_WINDOW` ("display over other apps") is in the APK, pulled in
  by a library. The app does not use it; consider adding it to
  `android.blockedPermissions` so reviewers don't ask about it.
- The upload goes to **Internal testing** first (up to 100 testers, by email
  list); closed testing with 12+ testers for 14 days is needed before a public
  production release on a new personal developer account.

## 6. Store listing (Grow users → Store presence → Main store listing)

Until the listing is filled and the app has passed review once, internal
testers see a temporary name (the package id) and no logo.

- **App name:** `MERCON Driver`
- **Short description (max 80):** `Trips, live trip tracking and instant alerts for MERCON truck drivers.`
- **Full description:**
  > MERCON Driver is the app for drivers working with MERCON.
  >
  > • Get new trips instantly, with a notification the moment the office assigns one
  > • See each trip's pickup and drop-off points, times and instructions
  > • Update the trip step by step: start, arrived, loading done, delivered
  > • Take photos of the cargo and proof of delivery
  > • Share your location with the office only while a trip is running
  > • Report delays and use SOS in an emergency
  > • See your trip history, earnings and documents
  > • English and Urdu
  >
  > This app is for MERCON drivers only. You need an account from your MERCON operator to sign in.
- **App icon (512×512):** `docs/play-store/play-icon-512.png`
- **Feature graphic (1024×500):** `docs/play-store/play-feature-graphic-1024x500.png`
- **Phone screenshots:** at least 2 (e.g. login, trips list, trip details, live trip).
  Take them from a real phone (`adb exec-out screencap -p > shot.png`) using
  a test account. Never show real customer or driver data.
- App category: **Business** (or Maps & Navigation). Contact email: the company email.
