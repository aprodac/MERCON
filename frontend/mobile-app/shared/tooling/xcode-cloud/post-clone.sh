#!/bin/zsh
# Xcode Cloud post-clone step for the MERCON mobile apps (driver-app / operator-app).
# Called from <app>/ios/ci_scripts/ci_post_clone.sh — Xcode Cloud runs that file
# after cloning the repo and before it builds. Setup: docs/XCODE_CLOUD_SETUP.md
#
# What it does, so the archive is always built from the current code:
#   1. installs Node 22 + CocoaPods (Xcode Cloud machines have neither)
#   2. `npm ci` in the mobile workspace (frontend/mobile-app)
#   3. picks the API from the branch: main → https://mercon.tech/api, else dev
#   4. regenerates ios/ with `expo prebuild --clean` + `pod install` — the
#      committed ios/ only exists so Xcode Cloud can find the project; a stale
#      one ships a build that crashes on launch (driver build 101)
#
# Usage: post-clone.sh <app folder name>   e.g. post-clone.sh driver-app
set -euo pipefail

APP="${1:?usage: post-clone.sh driver-app|operator-app}"
REPO="${CI_PRIMARY_REPOSITORY_PATH:?not running on Xcode Cloud (CI_PRIMARY_REPOSITORY_PATH unset)}"
WORKSPACE_DIR="$REPO/frontend/mobile-app"
APP_DIR="$WORKSPACE_DIR/$APP"

export CI=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_ENV_HINTS=1

echo "== Tools"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22.* ]]; then
  brew install node@22
  export PATH="$(brew --prefix node@22)/bin:$PATH"
fi
command -v pod >/dev/null || brew install cocoapods
echo "node $(node -v) · pod $(pod --version)"

echo "== API for branch '${CI_BRANCH:-?}'"
if [[ "${CI_BRANCH:-}" == "main" ]]; then
  API_URL=https://mercon.tech/api
else
  API_URL=https://dev.mercon.tech/api
fi
# Expo reads .env.local during prebuild and again when Xcode bundles the JS.
# TestFlight / App Store use Apple's production push servers.
cat > "$APP_DIR/.env.local" <<EOF
EXPO_PUBLIC_API_URL=$API_URL
APS_ENVIRONMENT=production
EOF
echo "$APP → $API_URL"

# app.config.ts uses the higher of version.json and BUILD_NUMBER, so every
# Xcode Cloud build gets a new build number (set the starting number in
# App Store Connect → Xcode Cloud → Settings → Build Number).
if [[ -n "${CI_BUILD_NUMBER:-}" ]]; then
  echo "BUILD_NUMBER=$CI_BUILD_NUMBER" >> "$APP_DIR/.env.local"
  export BUILD_NUMBER="$CI_BUILD_NUMBER"
fi

echo "== npm ci (mobile workspace)"
cd "$WORKSPACE_DIR"
npm ci --no-audit --no-fund

echo "== expo prebuild (ios, clean)"
cd "$APP_DIR"
# --clean deletes ios/, including ci_scripts/ (Xcode Cloud runs its later
# scripts from there) and TestFlight/ — keep them aside and put them back.
KEEP="$(mktemp -d)"
cp -R ios/ci_scripts "$KEEP/"
[[ -d ios/TestFlight ]] && cp -R ios/TestFlight "$KEEP/"
npx expo prebuild --platform ios --clean --no-install
cp -R "$KEEP/ci_scripts" ios/
[[ -d "$KEEP/TestFlight" ]] && cp -R "$KEEP/TestFlight" ios/
rm -rf "$KEEP"

echo "== pod install"
cd ios
# The "Bundle React Native code" build phase finds Node through this file.
echo "export NODE_BINARY=$(command -v node)" > .xcode.env.local
LANG=en_US.UTF-8 pod install

echo "== Ready: $(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' ./*/Info.plist) ($(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' ./*/Info.plist))"
