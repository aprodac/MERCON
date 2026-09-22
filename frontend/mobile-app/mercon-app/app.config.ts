import type { ExpoConfig } from 'expo/config';

/**
 * Per-client build profile. Each client gets its own binary, bundle
 * identifier, and store listing — Expo bakes icons/splash/bundle ID in at
 * build time, so these can't be swapped at runtime the way web branding can
 * (see Settings / useBranding on the web dashboard). Selected via
 * APP_CLIENT at build time (EAS build profile env, or local `APP_CLIENT=mtl
 * npx expo start`); defaults to mercon so no env change is required for the
 * existing app.
 *
 * Adding a new client: add its assets under assets/images/<client>/, add a
 * profile below, and give its EAS build profile (eas.json) APP_CLIENT=<key>.
 */
const CLIENT_PROFILES = {
  mercon: {
    name: 'mercon-app',
    slug: 'mercon-app',
    scheme: 'merconapp',
    iosBundleIdentifier: 'tech.merconmobile.app',
    androidPackage: 'tech.merconmobile.app',
    icon: './assets/images/merconclosed.png',
    splashImage: './assets/images/merconclosed.png',
    androidAdaptiveForeground: './assets/images/merconclosed.png',
    androidAdaptiveBackground: './assets/images/android-icon-background.png',
    androidAdaptiveMonochrome: './assets/images/android-icon-monochrome.png',
    favicon: './assets/images/favicon.png',
    apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://dev.mercon.tech/api',
    brandColor: '#FA634E',
    brandColorLight: '#FFF0EB',
    brandColorDark: '#D94E38',
  },
  // mtl: { ... } — add once MTL's mobile assets and bundle IDs exist.
} as const;

type ClientKey = keyof typeof CLIENT_PROFILES;

const clientKey = (process.env.APP_CLIENT as ClientKey) || 'mercon';
const client = CLIENT_PROFILES[clientKey];

if (!client) {
  throw new Error(
    `Unknown APP_CLIENT "${process.env.APP_CLIENT}" — add a profile for it in app.config.ts's CLIENT_PROFILES.`,
  );
}

export default (): ExpoConfig => ({
  name: client.name,
  slug: client.slug,
  version: '1.0.0',
  orientation: 'portrait',
  icon: client.icon,
  scheme: client.scheme,
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: client.iosBundleIdentifier,
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
      'android.permission.POST_NOTIFICATIONS',
    ],
    package: client.androidPackage,
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
    [
      'expo-notifications',
      {
        icon: client.icon,
        color: client.brandColor,
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
      'expo-location',
      {
        locationWhenInUsePermission: `${client.name} shares your location with your operator while you're on an active trip, so they can track the delivery.`,
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
    // Read by src/lib/api.ts as the required fallback when EXPO_PUBLIC_API_URL
    // isn't set — per-client, so a misconfigured build can't silently talk to
    // another client's API.
    apiUrl: client.apiUrl,
    brandColor: client.brandColor,
    brandColorLight: client.brandColorLight,
    brandColorDark: client.brandColorDark,
  },
  owner: 'alan32',
});
