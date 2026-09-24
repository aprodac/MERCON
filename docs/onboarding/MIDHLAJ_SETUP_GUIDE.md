# 📱 MERCON Mobile App — Developer Setup Guide for Midhlaj

This guide walks through setting up your local environment, configuring the `.env` file to target **`https://dev.mercon.tech/api`**, starting the Metro server, and connecting your mobile phone via **USB Cable** or **Wi-Fi** using Expo Go.

---

## 🛠️ Step 1: Prerequisites

Before starting, ensure you have the following installed on your machine and mobile phone:

1. **Node.js**: Version 18+ or 20+ installed on your computer.
2. **Git**: Installed and configured.
3. **Expo Go App**:
   - **iOS**: Download **Expo Go** from the Apple App Store.
   - **Android**: Download **Expo Go** from the Google Play Store.

---

## 📂 Step 2: Clone & Install Dependencies

Open your terminal (PowerShell, Command Prompt, or VS Code Terminal) and run:

```bash
# 1. Clone the repository (if not already cloned)
git clone https://github.com/StarShape-in/MERCON.git
cd MERCON

# 2. Switch to the dev branch
git checkout dev
git pull origin dev

# 3. Install root & workspace dependencies
npm install
```

---

## ⚙️ Step 3: Environment Setup (`.env`)

To connect your local app directly to the **dev.mercon.tech** server:

1. Navigate to `frontend/mobile-app/driver-app/`.
2. Open or create the **`.env`** file:

```env
EXPO_PUBLIC_API_URL=https://dev.mercon.tech/api
```

> [!IMPORTANT]
> The `EXPO_PUBLIC_` prefix is strictly required by Expo so that the environment variable is bundled into the JavaScript app bundle at runtime.

---

## 🚀 Step 4: Start the Metro Development Server

From the project root directory (`MERCON`), start Metro by running:

```bash
npm run mobile:driver     # or: npm run mobile:operator
```

*(Alternatively, you can run `cd frontend/mobile-app/driver-app && npm run start`)*

Once started, Metro will output a QR code and local URLs in your terminal:
```text
env: load .env
env: export EXPO_PUBLIC_API_URL

Metro waiting on exp://192.168.1.XX:8081
```

---

## 🔌 Step 5: Connecting Your Mobile Phone

### Method A: USB Cable Connection (Recommended & Fastest)

#### For iOS (iPhone):
1. Connect your iPhone to your computer using a USB cable.
2. Trust the computer on your iPhone if prompted.
3. Open the **Expo Go** app on your iPhone.
4. Tap **Enter URL manually**.
5. Type `http://127.0.0.1:8081` and tap **Connect**.

#### For Android:
1. Connect your Android phone to your computer via USB.
2. Enable **USB Debugging** on your phone (*Settings > Developer Options > USB Debugging*).
3. In your terminal on your computer, run:
   ```bash
   adb reverse tcp:8081 tcp:8081
   ```
4. Open the **Expo Go** app.
5. Tap **Enter URL manually**, type `http://localhost:8081`, and tap **Connect**.

---

### Method B: Same Wi-Fi Connection

1. Connect your mobile phone and computer to the **same Wi-Fi network** (or phone mobile hotspot).
2. Open **Expo Go** on your phone.
3. **iOS**: Open the Camera app and scan the QR code displayed in your computer terminal, or enter `exp://<YOUR_COMPUTER_IP>:8081` manually in Expo Go.
4. **Android**: Tap **Scan QR code** in the Expo Go app and scan the terminal QR code.

---

### Method C: Tunnel Mode (Works Anywhere — No Shared Wi-Fi Required)

If your computer and phone are on different networks, run Expo in tunnel mode:

```bash
npm run mobile:driver:tunnel   # or mobile:operator:tunnel
```

Scan the generated Tunnel QR code in Expo Go.

---

## 🔑 Step 6: Log In & Test

Once the app loads on your phone:

1. **Driver Login**:
   - **Username / Phone**: `driver1` or `+966500000001`
   - **Password**: `driver123`
2. Perform test trip updates (*Arrived at Pickup*, *Confirm Cargo*, *Start Trip*, *Complete Delivery*).
3. Verify that requests hit **`https://dev.mercon.tech/api`**.

---

## ❓ Troubleshooting & Quick Tips

- **Metro Cache Issue**: If environment variables or styles don't update, press `r` in the Metro terminal to reload, or restart with cache clear:
  ```bash
  npm run mobile:driver -- --clear
  ```
- **Test Server Health**: You can open `https://dev.mercon.tech/api/health` in your browser to confirm backend server status.
