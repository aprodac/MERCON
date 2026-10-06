#!/bin/zsh
# Xcode Cloud runs this after cloning. The steps live in shared/ so both apps stay in step.
exec "$CI_PRIMARY_REPOSITORY_PATH/frontend/mobile-app/shared/tooling/xcode-cloud/post-clone.sh" operator-app
