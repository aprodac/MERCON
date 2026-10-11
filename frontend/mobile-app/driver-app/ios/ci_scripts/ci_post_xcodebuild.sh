#!/bin/zsh
# Xcode Cloud runs this after the archive: writes the TestFlight "What to Test" notes.
exec "$CI_PRIMARY_REPOSITORY_PATH/frontend/mobile-app/shared/tooling/xcode-cloud/post-xcodebuild.sh" "$CI_PRIMARY_REPOSITORY_PATH/frontend/mobile-app/driver-app/ios"
