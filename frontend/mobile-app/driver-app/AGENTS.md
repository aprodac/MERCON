# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Version numbers (iOS / Android uploads)

Each app's version and build number live in its `version.json` — never in `app.config.ts`
or in Xcode. Before every store/TestFlight upload run `npm run version:bump` (build +1;
add `-- patch|minor|major` for a new release) and commit `version.json`. The script also
writes the numbers into the git-ignored `ios/` project so Xcode archives carry them
(`shared/tooling/app-version.js`, `docs/IOS_DISTRIBUTION_AND_PUSH.md` §C5).
