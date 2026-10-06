import type { ExpoConfig } from 'expo/config';

/**
 * MERCON Driver app (drivers only). The operator app lives in ../operator-app;
 * shared code, brand assets and build tooling live in ../shared.
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
    name: 'Mercon Driver',
    // Slug stays 'mercon-app': it is bound to the existing EAS project (projectId below).
    slug: 'mercon-app',
    scheme: 'mercondriver',
    // iOS and Android IDs differ on purpose:
    // - iOS uses the new App Store record (the old tech.mercon.driver record is not ours to use).
    // - Android must stay tech.mercon.driver: the Play Console app, its upload key (EAS keystore,
    //   SHA-1 E9:F7:09:B1…) and the Firebase/FCM config (google-services.json) are all on it.
    //   A new package = a new Play listing, a new signing key and no push. See docs/ANDROID_PLAY_RELEASE.md.
    iosBundleIdentifier: 'tech.merconapp.driver',
    androidPackage: 'tech.mercon.driver',
    icon: '../shared/assets/images/driver-icon.png',
    splashImage: '../shared/assets/images/merconclosed.png',
    androidAdaptiveForeground: '../shared/assets/images/driver-adaptive-icon.png',
    androidAdaptiveBackground: '../shared/assets/images/driver-icon-background.png',
    androidAdaptiveMonochrome: '../shared/assets/images/android-icon-monochrome.png',
    favicon: '../shared/assets/images/favicon.png',
    // Android draws the push icon from its transparency only — a full-colour
    // logo shows up as a white square. A white "M" on transparent.
    notificationIcon: '../shared/assets/images/notification-icon.png',
    apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://dev.mercon.tech/api',
    brandColor: '#FA634E',
    brandColorLight: '#FFF0EB',
    brandColorDark: '#D94E38',
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

// Firebase config for Android push (Expo delivers to Android through Firebase
// Cloud Messaging). EAS can hand the file over as a file secret
// (GOOGLE_SERVICES_JSON); otherwise it is read from this folder. Without it the
// build still works — Android just cannot receive pushes.
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON ||
  (require('fs').existsSync(`${process.cwd()}/google-services.json`) ? './google-services.json' : undefined);

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
    // Trip pushes are sent as Time Sensitive (pushNotificationService on the
    // API), so a Focus such as Driving or the Scheduled Summary doesn't hold
    // them back. Without this entitlement iOS delivers them as ordinary pushes.
    entitlements: {
      'com.apple.developer.usernotifications.time-sensitive': true,
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
      'android.permission.POST_NOTIFICATIONS',
    ],
    package: client.androidPackage,
    versionCode: buildNumber,
    ...(googleServicesFile ? { googleServicesFile } : {}),
    // Trip GPS runs as a foreground service started while the app is on
    // screen, which Android treats as "while in use". Keep the "all the time"
    // permission out so no library can add it — it would bring a Play Console
    // background-location review.
    blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
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
      'expo-notifications',
      {
        icon: client.notificationIcon,
        color: client.brandColor,
        // TestFlight / App Store builds talk to Apple's production push service.
        // Set APS_ENVIRONMENT=production in .env.local before prebuilding for an
        // Xcode archive (docs/IOS_DISTRIBUTION_AND_PUSH.md); dev-client builds keep
        // 'development' (matching a development profile).
        mode: process.env.APS_ENVIRONMENT === 'production' ? 'production' : 'development',
      },
    ],
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
        cameraPermission: `${client.name} uses the camera to capture cargo and proof-of-delivery photos for your trips.`,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: `${client.name} uses the camera to capture cargo and proof-of-delivery photos for your trips.`,
        // Photos only — the in-app camera never records sound or scans barcodes.
        recordAudioAndroid: false,
        barcodeScannerEnabled: false,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: `${client.name} shares your location with your operator while you're on an active trip, so they can track the delivery.`,
        // Trip GPS keeps going in Google Maps / with the screen off, shown by a
        // "sharing your trip location" notification (services/tripLocationTask).
        isAndroidForegroundServiceEnabled: true,
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    'expo-image',
    'expo-status-bar',
    'expo-web-browser',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: '2697c85a-0ac8-4a2e-9225-5cc84a5b518d',
    },
    // Read by shared/lib/api.ts (@mercon/mobile-shared) as the required fallback when EXPO_PUBLIC_API_URL
    // isn't set — per-client, so a misconfigured build can't silently talk to
    // another client's API.
    apiUrl: client.apiUrl,
    brandColor: client.brandColor,
    brandColorLight: client.brandColorLight,
    brandColorDark: client.brandColorDark,
  },
  owner: 'alan32',
});
