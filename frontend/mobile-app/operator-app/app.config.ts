import type { ExpoConfig } from 'expo/config';

/**
 * MERCON Operator app (Operators and Admins). The driver app lives in
 * ../driver-app; shared code, brand assets and build tooling live in ../shared.
 *
 * Per-client build profile. Each client gets its own binary, bundle
 * identifier, and store listing — Expo bakes icons/splash/bundle ID in at
 * build time, so these can't be swapped at runtime the way web branding can
 * (see Settings / useBranding on the web dashboard). Selected via
 * APP_CLIENT at build time (EAS build profile env, or local `APP_CLIENT=mtl
 * npx expo start`); defaults to mercon so no env change is required for the
 * existing app.
 *
 * Adding a new client: add its assets under ../shared/assets/images/<client>/, add a
 * profile below, and give its EAS build profile (eas.json) APP_CLIENT=<key>.
 */
const CLIENT_PROFILES = {
  mercon: {
    name: 'Mercon Operator',
    slug: 'mercon-operator',
    scheme: 'merconoperator',
    iosBundleIdentifier: 'tech.mercon.operator',
    androidPackage: 'tech.mercon.operator',
    icon: '../shared/assets/images/operator-icon.png',
    splashImage: '../shared/assets/images/merconclosed.png',
    androidAdaptiveForeground: '../shared/assets/images/operator-adaptive-icon.png',
    androidAdaptiveBackground: '../shared/assets/images/android-icon-background.png',
    androidAdaptiveMonochrome: '../shared/assets/images/android-icon-monochrome.png',
    favicon: '../shared/assets/images/favicon.png',
    apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://dev.mercon.tech/api',
    brandColor: '#FA634E',
    brandColorLight: '#FFF0EB',
    brandColorDark: '#D94E38',
    // Darkest neutral — the web's brand charcoal, used instead of black across the operator app.
    inkColor: '#3E3C3D',
  },
  // mtl: { ... } — add once MTL's mobile assets and bundle IDs exist.
} as const;

type ClientKey = keyof typeof CLIENT_PROFILES;

const clientKey = (process.env.APP_CLIENT as ClientKey) || 'mercon';

// Version + build number live in version.json (bump with `npm run version:bump`,
// which also writes them into ios/ for Xcode archives — see
// ../shared/tooling/app-version.js). Codemagic (Android only) sets BUILD_NUMBER;
// it only wins when higher, so a CI build never goes below a number already uploaded.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appVersion: { version: string; buildNumber: number } = require('./version.json');
const buildNumber = Math.max(appVersion.buildNumber, Number(process.env.BUILD_NUMBER) || 0);
const client = CLIENT_PROFILES[clientKey];

if (!client) {
  throw new Error(
    `Unknown APP_CLIENT "${process.env.APP_CLIENT}" — add a profile for it in app.config.ts's CLIENT_PROFILES.`,
  );
}

export default (): ExpoConfig => ({
  name: client.name,
  slug: client.slug,
  version: appVersion.version,
  orientation: 'portrait',
  icon: client.icon,
  scheme: client.scheme,
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: client.iosBundleIdentifier,
    // Apple team the app is signed with (Ilan Usman's account today; change it
    // when the apps move to the organisation account). Prebuild writes it into
    // ios/, so a regenerated project can still be archived without opening Xcode.
    appleTeamId: 'Z83Y9VJTKH',
    buildNumber: String(buildNumber),
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: client.androidAdaptiveForeground,
      backgroundImage: client.androidAdaptiveBackground,
      monochromeImage: client.androidAdaptiveMonochrome,
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
    ],
    package: client.androidPackage,
    versionCode: buildNumber,
  },
  web: {
    output: 'static',
    favicon: client.favicon,
  },
  plugins: [
    // ── Inline config plugin: fix SplashScreenManager crash on Android < 12 ──
    // expo prebuild regenerates android/app/src/main/java/.../MainActivity.kt
    // from scratch every time (android/ is git-ignored). Without this plugin the
    // vanilla generated file calls SplashScreenManager.registerOnActivity(this)
    // unconditionally, which crashes on Android 10/11 (API < 31).
    // This plugin wraps the call in a try/catch + API-level guard after prebuild.
    ((config: ExpoConfig) => {
      const { withMainActivity } = require('@expo/config-plugins');
      return withMainActivity(config, (mod: any) => {
        let src: string = mod.modResults.contents;

        // Ensure AppTheme is set and SplashScreenManager is wrapped in try-catch
        const target = 'SplashScreenManager.registerOnActivity(this)';
        const safeCall = `setTheme(R.style.AppTheme)\n    try {\n      SplashScreenManager.registerOnActivity(this)\n    } catch (e: Throwable) {\n      android.util.Log.w("MainActivity", "SplashScreenManager failed: \${e.message}")\n    }`;

        if (src.includes(target) && !src.includes('SplashScreenManager failed')) {
          src = src.replace(target, safeCall);
        }

        mod.modResults.contents = src;
        return mod;
      });
    }) as any,
    'expo-router',
    // Release signing from Codemagic's keystore (no-op elsewhere)
    '../shared/tooling/with-release-signing',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: client.splashImage,
        imageWidth: 160,
      },
    ],
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        cameraPermission: `${client.name} uses the camera to attach photos and videos to trips.`,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: `${client.name} adds your location to the photos and videos you attach to trips.`,
      },
    ],
    'expo-image',
    // Trip maps (native; needs a new build — the trip screen falls back without it).
    '@maplibre/maplibre-react-native',
    'expo-status-bar',
    'expo-web-browser',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    // EAS project: run `eas init` in operator-app once to create it and add
    // `eas: { projectId: '<id>' }` here.
    // Read by shared/lib/api.ts (@mercon/mobile-shared) as the required fallback when EXPO_PUBLIC_API_URL
    // isn't set — per-client, so a misconfigured build can't silently talk to
    // another client's API.
    apiUrl: client.apiUrl,
    brandColor: client.brandColor,
    brandColorLight: client.brandColorLight,
    brandColorDark: client.brandColorDark,
    inkColor: client.inkColor,
  },
  owner: 'alan32',
});
