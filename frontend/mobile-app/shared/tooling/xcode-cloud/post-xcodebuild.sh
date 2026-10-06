#!/bin/zsh
# Xcode Cloud post-xcodebuild step: writes the TestFlight "What to Test" notes
# from the latest commits, so testers see what changed. Called from
# <app>/ios/ci_scripts/ci_post_xcodebuild.sh. Setup: docs/XCODE_CLOUD_SETUP.md
#
# Usage: post-xcodebuild.sh <path to the app's ios/ folder>
set -euo pipefail

IOS_DIR="${1:?usage: post-xcodebuild.sh <ios dir>}"

# Only archives that were signed for TestFlight / the App Store get notes.
[[ -n "${CI_APP_STORE_SIGNED_APP_PATH:-}" ]] || exit 0

mkdir -p "$IOS_DIR/TestFlight"
{
  echo "Branch ${CI_BRANCH:-?} · build ${CI_BUILD_NUMBER:-?}"
  echo
  git -C "$CI_PRIMARY_REPOSITORY_PATH" log -10 --no-merges --pretty=format:'- %s' 2>/dev/null || true
} | cut -c1-200 | head -c 3900 > "$IOS_DIR/TestFlight/WhatToTest.en-US.txt"

cat "$IOS_DIR/TestFlight/WhatToTest.en-US.txt"
