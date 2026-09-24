import { Linking, Platform } from 'react-native';

export interface MapStopInput {
  location_lat?: number | null;
  location_lng?: number | null;
  location_name?: string | null;
  location_address?: string | null;
  location?: { id?: string; name?: string; address?: string | null } | null;
  address?: string | null;
}

/**
 * Opens the target location in an external navigation app.
 *
 * Priority chain:
 *   Android: 1) Google Maps app  2) Chrome browser  3) System browser
 *   iOS:     1) Google Maps app  2) Apple Maps app  3) Chrome browser  4) System browser
 *
 * GPS tracking is handled separately by expo-location in DriverLiveTracking / LiveNavigationScreen.
 * This function is only for launching external turn-by-turn navigation when the driver taps the
 * "Go to Pickup / Delivery" button.
 */
export async function openInGoogleMaps(stop?: MapStopInput | null): Promise<void> {
  if (!stop) return;

  const lat = stop.location_lat;
  const lng = stop.location_lng;
  const label =
    stop.location_name ||
    stop.location?.name ||
    stop.location_address ||
    stop.address ||
    'Destination';
  const encodedLabel = encodeURIComponent(label);

  if (lat != null && lng != null && (lat !== 0 || lng !== 0)) {
    // ── Deep link URLs ──────────────────────────────────────────────────────
    // Google Maps app — native scheme differs per platform
    const googleMapsApp = Platform.select({
      ios: `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`,
      android: `google.navigation:q=${lat},${lng}`,
      default: `geo:${lat},${lng}?q=${lat},${lng}(${encodedLabel})`,
    }) as string;

    // Apple Maps (iOS only)
    const appleMapsApp = `maps://app?daddr=${lat},${lng}&q=${encodedLabel}`;

    // Chrome browser — deep-link scheme opens Chrome specifically
    const googleMapsWebUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    const chromeBrowser = `googlechrome://navigate?url=${encodeURIComponent(googleMapsWebUrl)}`;

    // Final system-browser fallback
    const webFallback = googleMapsWebUrl;

    try {
      // 1️⃣ Google Maps app (best driving experience)
      const hasGoogleMaps = await Linking.canOpenURL(googleMapsApp).catch(() => false);
      if (hasGoogleMaps) {
        await Linking.openURL(googleMapsApp);
        return;
      }

      // 2️⃣ Apple Maps (iOS only)
      if (Platform.OS === 'ios') {
        const hasAppleMaps = await Linking.canOpenURL(appleMapsApp).catch(() => false);
        if (hasAppleMaps) {
          await Linking.openURL(appleMapsApp);
          return;
        }
      }

      // 3️⃣ Chrome browser
      const hasChrome = await Linking.canOpenURL(chromeBrowser).catch(() => false);
      if (hasChrome) {
        await Linking.openURL(chromeBrowser);
        return;
      }

      // 4️⃣ System default browser / handler
      await Linking.openURL(webFallback);
    } catch {
      Linking.openURL(webFallback).catch(() => {});
    }
  } else if (label) {
    // No coordinates — search by name instead
    const query = encodeURIComponent(label);
    const googleMapsSearch = Platform.select({
      ios: `comgooglemaps://?q=${query}`,
      android: `geo:0,0?q=${query}`,
    }) as string | undefined;
    const webSearch = `https://www.google.com/maps/search/?api=1&query=${query}`;

    try {
      if (googleMapsSearch) {
        const hasGoogleMaps = await Linking.canOpenURL(googleMapsSearch).catch(() => false);
        if (hasGoogleMaps) {
          await Linking.openURL(googleMapsSearch);
          return;
        }
      }
      if (Platform.OS === 'ios') {
        const appleMapsSearch = `maps://app?q=${query}`;
        const hasAppleMaps = await Linking.canOpenURL(appleMapsSearch).catch(() => false);
        if (hasAppleMaps) {
          await Linking.openURL(appleMapsSearch);
          return;
        }
      }
      await Linking.openURL(webSearch);
    } catch {
      Linking.openURL(webSearch).catch(() => {});
    }
  }
}
