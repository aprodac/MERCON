import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, StyleProp, ViewStyle, Platform } from 'react-native';
import { LEAFLET_CSS, LEAFLET_JS } from '../../assets/leaflet/leafletBundle';
import { isValidCoordinate, type LatLng } from '../../utils/geo';

// Safely resolve WebView to prevent TurboModuleRegistry crashes on devices
// whose native binary has not yet compiled react-native-webview (RNCWebViewModule).
let WebViewComponent: any = null;
let webViewLoadError: string | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RNWebView = require('react-native-webview');
  WebViewComponent = RNWebView.WebView || RNWebView.default || RNWebView;
} catch (err: any) {
  webViewLoadError = err?.message || 'RNCWebViewModule not found in native binary';
  console.warn('[OsmMapView] react-native-webview native module not available:', err?.message);
}

export interface MarkerInfo {
  coordinate: LatLng;
  title?: string | null;
  address?: string | null;
}

const DEFAULT_CENTER: LatLng = { latitude: 24.7136, longitude: 46.6753 }; // Riyadh, Saudi Arabia

export interface OsmMapViewProps {
  destination?: MarkerInfo | null;
  pickup?: MarkerInfo | null;
  driverPosition?: LatLng | null;
  routeCoordinates?: LatLng[] | null;
  initialCenter?: LatLng;
  zoomLevel?: number;
  showsUserLocation?: boolean;
  onMapReady?: () => void;
  style?: StyleProp<ViewStyle>;
}

export interface OsmMapViewRef {
  recenter: () => void;
}

export const OsmMapView = React.forwardRef<OsmMapViewRef, OsmMapViewProps>(({
  destination,
  pickup,
  driverPosition,
  routeCoordinates,
  initialCenter,
  zoomLevel = 14,
  onMapReady,
  style,
}, ref) => {
  const webViewRef = useRef<any>(null);
  const isReadyRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  // Fixed initial center determined at mount time — MUST NOT change when live GPS updates arrive
  const initialMapCenter = useRef<LatLng>({
    latitude: initialCenter?.latitude ?? pickup?.coordinate.latitude ?? destination?.coordinate.latitude ?? DEFAULT_CENTER.latitude,
    longitude: initialCenter?.longitude ?? pickup?.coordinate.longitude ?? destination?.coordinate.longitude ?? DEFAULT_CENTER.longitude,
  }).current;

  React.useImperativeHandle(ref, () => ({
    recenter: () => {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          try {
            var pts = [];
            if (destinationMarker) pts.push(destinationMarker.getLatLng());
            if (pickupMarker) pts.push(pickupMarker.getLatLng());
            if (driverMarker) pts.push(driverMarker.getLatLng());
            if (pts.length > 1) {
              map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 16 });
            } else if (pts.length === 1) {
              map.panTo(pts[0]);
            }
          } catch(e) {}
          true;
        `);
      }
    }
  }));

  // Validate coordinates before passing
  const validDestination = useMemo(() => {
    if (destination && isValidCoordinate(destination.coordinate.latitude, destination.coordinate.longitude)) {
      return destination;
    }
    return null;
  }, [destination]);

  const validPickup = useMemo(() => {
    if (pickup && isValidCoordinate(pickup.coordinate.latitude, pickup.coordinate.longitude)) {
      return pickup;
    }
    return null;
  }, [pickup]);

  const validDriverPos = useMemo(() => {
    if (driverPosition && isValidCoordinate(driverPosition.latitude, driverPosition.longitude)) {
      return driverPosition;
    }
    return null;
  }, [driverPosition]);

  const validRoute = useMemo(() => {
    if (!routeCoordinates || !Array.isArray(routeCoordinates) || routeCoordinates.length === 0) {
      return null;
    }
    const filtered = routeCoordinates.filter((c) => isValidCoordinate(c.latitude, c.longitude));
    return filtered.length > 0 ? filtered : null;
  }, [routeCoordinates]);

  // Generate self-contained Leaflet HTML with locally bundled assets.
  // Must ONLY be generated once per mount and NEVER reloaded when driver coordinates update.
  const htmlContent = useMemo(() => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    ${LEAFLET_CSS}
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background-color: #F8FAFC;
    }
    /* Custom SVG Pin Styles */
    .dest-pin-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transform: translate(-50%, -100%);
    }
    .dest-pin-body {
      width: 36px;
      height: 36px;
      background: #FA634E;
      border: 3px solid #FFFFFF;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 4px 10px rgba(250, 99, 78, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .dest-pin-icon {
      transform: rotate(45deg);
      color: #FFFFFF;
      font-size: 16px;
      font-weight: bold;
    }
    .dest-pin-pulse {
      width: 14px;
      height: 6px;
      background: rgba(0, 0, 0, 0.25);
      border-radius: 50%;
      margin-top: 2px;
    }

    .truck-pin-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      transform: translate(-50%, -50%);
    }
    .truck-pin-body {
      width: 34px;
      height: 34px;
      background: #3E3C3D;
      border: 2.5px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFFFFF;
      font-size: 16px;
    }
    .leaflet-control-attribution {
      font-size: 9px !important;
      background: rgba(255, 255, 255, 0.7) !important;
      padding: 1px 5px !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    ${LEAFLET_JS}

    var map = L.map('map', {
      zoomControl: false,
      attributionControl: true
    }).setView([${initialMapCenter.latitude}, ${initialMapCenter.longitude}], ${zoomLevel});

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    var destinationMarker = null;
    var pickupMarker = null;
    var driverMarker = null;
    var routePolyline = null;
    var hasFittedBounds = false;

    // Custom Icon Creators
    function createDestIcon() {
      return L.divIcon({
        className: 'custom-dest-icon',
        html: '<div class="dest-pin-wrap"><div class="dest-pin-body"><span class="dest-pin-icon">📍</span></div><div class="dest-pin-pulse"></div></div>',
        iconSize: [36, 44],
        iconAnchor: [18, 44]
      });
    }

    function createPickupIcon() {
      return L.divIcon({
        className: 'custom-pickup-icon',
        html: '<div class="dest-pin-wrap"><div class="dest-pin-body" style="background:#3B82F6;"><span class="dest-pin-icon">📦</span></div><div class="dest-pin-pulse"></div></div>',
        iconSize: [36, 44],
        iconAnchor: [18, 44]
      });
    }

    function createTruckIcon() {
      return L.divIcon({
        className: 'custom-truck-icon',
        html: '<div class="truck-pin-wrap"><div class="truck-pin-body">🚚</div></div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
    }

    window.updateData = function(data) {
      try {
        var pointsToFit = [];

        // 1. Destination
        if (data.destination && data.destination.coordinate) {
          var destLatLng = [data.destination.coordinate.latitude, data.destination.coordinate.longitude];
          pointsToFit.push(destLatLng);
          if (!destinationMarker) {
            destinationMarker = L.marker(destLatLng, { icon: createDestIcon() }).addTo(map);
          } else {
            destinationMarker.setLatLng(destLatLng);
          }
        } else if (destinationMarker) {
          map.removeLayer(destinationMarker);
          destinationMarker = null;
        }

        // 2. Pickup
        if (data.pickup && data.pickup.coordinate) {
          var pickLatLng = [data.pickup.coordinate.latitude, data.pickup.coordinate.longitude];
          pointsToFit.push(pickLatLng);
          if (!pickupMarker) {
            pickupMarker = L.marker(pickLatLng, { icon: createPickupIcon() }).addTo(map);
          } else {
            pickupMarker.setLatLng(pickLatLng);
          }
        } else if (pickupMarker) {
          map.removeLayer(pickupMarker);
          pickupMarker = null;
        }

        // 3. Driver
        if (data.driverPosition && typeof data.driverPosition.latitude === 'number' && typeof data.driverPosition.longitude === 'number') {
          var driverLatLng = [data.driverPosition.latitude, data.driverPosition.longitude];
          pointsToFit.push(driverLatLng);
          if (!driverMarker) {
            driverMarker = L.marker(driverLatLng, { icon: createTruckIcon(), zIndexOffset: 1000 }).addTo(map);
          } else {
            driverMarker.setLatLng(driverLatLng);
          }
        } else if (driverMarker) {
          map.removeLayer(driverMarker);
          driverMarker = null;
        }

        // 4. Route Polyline
        if (data.routeCoordinates && data.routeCoordinates.length > 0) {
          var polyCoords = data.routeCoordinates.map(function(c) { return [c.latitude, c.longitude]; });
          if (!routePolyline) {
            routePolyline = L.polyline(polyCoords, {
              color: '#FA634E',
              weight: 5,
              opacity: 0.85,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(map);
          } else {
            routePolyline.setLatLngs(polyCoords);
          }
        } else if (routePolyline) {
          map.removeLayer(routePolyline);
          routePolyline = null;
        }

        // Fit Bounds once initially if points available, else pan to single point
        if (!hasFittedBounds) {
          if (pointsToFit.length > 1) {
            map.fitBounds(L.latLngBounds(pointsToFit), { padding: [50, 50], maxZoom: 16 });
            hasFittedBounds = true;
          } else if (pointsToFit.length === 1) {
            map.panTo(pointsToFit[0]);
            hasFittedBounds = true;
          }
        }
      } catch (err) {
        // Safe degrade
      }
    };

    // Notify React Native that Leaflet map is initialized
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
    }
  </script>
</body>
</html>`;
  }, [initialMapCenter.latitude, initialMapCenter.longitude, zoomLevel]);

  // Sync data updates to WebView
  const syncMapData = useCallback((forcePayload?: any) => {
    if (!isReadyRef.current || !webViewRef.current) return;
    const payload = JSON.stringify(forcePayload || {
      destination: validDestination,
      pickup: validPickup,
      driverPosition: validDriverPos,
      routeCoordinates: validRoute,
    });
    webViewRef.current.injectJavaScript(`window.updateData(${payload}); true;`);
  }, [validDestination, validPickup, validDriverPos, validRoute]);

  useEffect(() => {
    syncMapData();
  }, [syncMapData]);

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const raw = event.nativeEvent?.data;
        if (!raw) return;
        const msg = JSON.parse(raw);
        if (msg?.type === 'MAP_READY') {
          isReadyRef.current = true;
          setIsReady(true);
          onMapReady?.();
          syncMapData({
            destination: validDestination,
            pickup: validPickup,
            driverPosition: validDriverPos,
            routeCoordinates: validRoute,
          });
        }
      } catch {
        // Safe ignore
      }
    },
    [onMapReady, syncMapData, validDestination, validPickup, validDriverPos, validRoute]
  );

  if (!WebViewComponent || webViewLoadError) {
    return (
      <View style={[styles.container, style, styles.fallbackContainer]}>
        <View style={styles.fallbackCard}>
          <Text style={styles.fallbackTitle}>Native Map Module Missing</Text>
          <Text style={styles.fallbackSubtitle}>
            `react-native-webview` requires rebuilding the native mobile binary.
          </Text>
          <Text style={styles.fallbackCode}>npx expo run:android</Text>
          <Text style={styles.fallbackSubcode}>or: npx expo run:ios</Text>
          {destination && (
            <View style={styles.destBox}>
              <Text style={styles.destLabel}>Target Destination:</Text>
              <Text style={styles.destValue} numberOfLines={2}>
                {destination.title || destination.address || `${destination.coordinate.latitude.toFixed(4)}, ${destination.coordinate.longitude.toFixed(4)}`}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebViewComponent
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={styles.webView}
        originWhitelist={['*']}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        geolocationEnabled={false}
        androidLayerType="hardware"
        onMessage={handleMessage}
        scrollEnabled={false}
        overScrollMode="never"
      />
      {!isReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FA634E" />
          <Text style={styles.loadingText}>Loading Map...</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F8FAFC',
  },
  webView: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 8,
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  fallbackContainer: {
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    maxWidth: 340,
    width: '100%',
  },
  fallbackTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
    textAlign: 'center',
  },
  fallbackSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 17,
  },
  fallbackCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#FA634E',
    backgroundColor: 'rgba(250, 99, 78, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
    fontWeight: '700',
  },
  fallbackSubcode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 10,
  },
  destBox: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    width: '100%',
    alignItems: 'center',
  },
  destLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  destValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E2E8F0',
    marginTop: 2,
    textAlign: 'center',
  },
});

export default OsmMapView;
