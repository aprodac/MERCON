#!/bin/zsh
# Xcode Cloud post-xcodebuild step: writes the TestFlight "What to Test" notes.
# Uses the app's WHAT_TO_TEST.txt (next to ios/) when there is one, else the
# latest commits, so testers see what changed. Called from
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
  if [[ -s "$IOS_DIR/../WHAT_TO_TEST.txt" ]]; then
    cat "$IOS_DIR/../WHAT_TO_TEST.txt"
  else
    git -C "$CI_PRIMARY_REPOSITORY_PATH" log -10 --no-merges --pretty=format:'- %s' 2>/dev/null | cut -c1-200 || true
  fi
} | head -c 3900 > "$IOS_DIR/TestFlight/WhatToTest.en-US.txt"

cat "$IOS_DIR/TestFlight/WhatToTest.en-US.txt"
