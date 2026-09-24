# 📱 MERCON Mobile App — Developer & Local Deployment Guide

This guide details the complete developer workflow for building, updating, debugging, and deploying the **MERCON Mobile App** (`@mercon/mobile-app`) across **Hysam's Mac** and **Windows** development machines.

---

## ⚡ Quick Server Startup (For IDEs & AI Assistants)

You can share this document with your IDE (Antigravity, Cursor, VS Code) or AI Assistant and tell it: *"Read DEVELOPER_GUIDE.md and run the server"*.

### Commands to Run:

```bash
# 🟢 Option A: Run Mobile Dev Server from Project Root
npm run mobile:driver     # or: npm run mobile:operator

# 🟢 Option B: Run Mobile Dev Server from App Directory
cd frontend/mobile-app/driver-app && npm start

# 🟢 Option C: Run Backend API Server (if needed locally)
npm run dev:api
```

---

## 🛠️ Overview & Architecture

- **Framework**: React Native ~0.86, Expo SDK ~57, Expo Router v4, NativeWind.
- **Custom Native Modules**: `react-native-maps`, `@expo/ui`, `expo-dev-client`, `expo-location`.
- **Primary iOS Host / Build Machine**: **Hysam's Mac** (`Hysam MacBook Air`).
- **Target Backend API**: `https://mercon.tech/api` (configured via `.env.local` / `app.config.ts`).

---

## 🚀 1. Initial Setup

### On Hysam's Mac (iOS & Android)
```bash
cd frontend/mobile-app/driver-app
npm install
npx expo prebuild --platform ios
```

### On Windows Machines (Android & Web)
```bash
cd frontend/mobile-app/driver-app
npm install
```

---

## ⚡ 2. Live Over-The-Air (OTA) Updates & Server Connection

### How OTA Live Updates Work
With **Expo Updates** (`expo-updates`), you can push **instant live JS/UI code updates directly to team and production phones over the air** without re-building native Xcode binaries or re-submitting to TestFlight/App Store!

- **What can be updated live OTA**: All React/JS code, UI components, screens, styles, bug fixes, and logic changes.
- **What requires a native rebuild**: Adding new native C++/CocoaPod plugins.

### Connecting Live Updates to Your Server (`https://mercon.tech`)

You can self-host your live updates directly on your server:

1. **Configure Update Server URL in `app.config.ts`**:
   ```ts
   updates: {
     url: 'https://mercon.tech/api/updates',
     enabled: true,
     checkAutomatically: 'ON_LOAD',
     fallbackToCacheTimeout: 0,
   }
   ```
2. **Export Bundle for Live Deployment**:
   ```bash
   npx expo export
   ```
   *This outputs the compiled production JS bundle and assets to the `dist/` directory.*
3. **Upload `dist/` to your server**:
   When the app opens on any user's phone, it automatically checks `https://mercon.tech/api/updates`, downloads the latest JS bundle in the background, and applies the update live!

---

## 📱 3. Installing Native App onto Team Phones

### iOS Devices (Built via Hysam's Mac)
Since iOS native compilation requires Xcode on macOS, **all iOS physical device installs are built locally from Hysam's Mac**:

1. **Connect iPhone** to Hysam's Mac via USB.
2. **Run Install Command**:
   ```bash
   npx expo run:ios --device "<Device Name or UDID>"
   ```
   *Example:* `npx expo run:ios --device "00008030-000648281A46402E"`
3. Alternatively, open Xcode (`open ios/merconapp.xcworkspace`) and press `Cmd + R`.

### Android Devices (Windows & Mac)
Developers on **Windows** or Mac can build and run on Android:
```bash
# Run on Android Emulator or connected Android phone via ADB:
npm run android
# Or generate installable APK:
cd android && ./gradlew assembleRelease
```

---

## 🔗 4. Connecting Team Phones to Metro Dev Server

When the app opens on a phone in development, the **Expo Dev Launcher** screen appears.

### How to Connect:
1. **Start Metro Server**:
   ```bash
   npx expo start --host lan
   ```
2. **Connect from Phone**:
   - **Auto-Detect**: Tap `mercon-app` listed under **"Development Servers"**.
   - **Manual USB URL**: Enter `http://127.0.0.1:8081` (over USB).
   - **Manual Wi-Fi URL**: Enter `http://<MAC_OR_WINDOWS_IP>:8081`.

---

## 🖥️ 5. How to View Logs & Debug (Windows & Mac)

Since we are using **Expo SDK 57** with `expo-dev-client`, developers on both **Windows** and **Mac** have multiple ways to view live logs and debug errors:

### A. Terminal Stream Logs (Windows & Mac)
When running `npx expo start` in Windows PowerShell / Command Prompt or Mac Terminal:
- All `console.log`, `console.error`, RedBox stack traces, and Axios API network errors automatically stream **live in your terminal**.

### B. Chrome / Edge Inspect (`chrome://inspect`) — Windows & Mac
To debug JS execution, inspect network calls, and view full error objects on Windows or Mac:
1. Open Google Chrome or Microsoft Edge on Windows/Mac.
2. Navigate to: `chrome://inspect` (or `edge://inspect`).
3. Under **Target**, you will see the Hermes JS engine running on the connected device.
4. Click **Inspect** to open full Chrome DevTools for your mobile app!

### C. Metro Web Interface
Open `http://localhost:8081` in Chrome/Edge on Windows or Mac:
- Press `Shift + M` on your keyboard to toggle the Expo Developer Menu on the device.
- Press `r` in the terminal to reload the JS bundle instantly.
- Press `j` to open Hermes debugger.

---

## ✈️ 6. Uploading Standalone Builds to TestFlight

To upload iOS builds to TestFlight without EAS:
1. Open Xcode on Hysam's Mac: `open ios/merconapp.xcworkspace`.
2. Target: **Any iOS Device (arm64)**.
3. Select **Product** → **Archive** → **Distribute App** → **TestFlight & App Store**.

---

## 🛠️ 7. Troubleshooting Common Issues

| Issue | Root Cause | Fix / Solution |
| :--- | :--- | :--- |
| **`database is locked`** | Multiple Xcode instances accessing DerivedData | Run: `rm -rf ~/Library/Developer/Xcode/DerivedData/merconapp-*` |
| **`Error: NO_SPACE_LEFT`** | Target iPhone storage full during USB install | Free up ~100MB storage on the target iPhone in Settings → Storage. |
| **Expo Go hangs / stuck scanning** | Expo Go missing custom native modules (`react-native-maps`, `@expo/ui`) | Use the Development Build (`mercon-app`) installed via Hysam's Mac instead of Expo Go. |
| **Viewing Logs on Windows** | Monitoring app activity on Windows | Use Windows Terminal (`npx expo start`), Metro Web (`http://localhost:8081`), or Chrome `chrome://inspect`. |
