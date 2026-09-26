/**
 * Driver navigation map — MapLibre GL (vector tiles) inside a WebView.
 *
 * Same basemaps and palette as the web dashboard's live trip map
 * (web-dashboard/src/components/maps/live/liveMapStyle.ts): OpenFreeMap
 * Liberty by day, Dark at night (free, keyless), recoloured Apple-Maps style,
 * with 3D buildings and a blue route. A WebView keeps it working in Expo Go
 * and in release builds without a native map module.
 *
 * Camera: `follow` keeps the truck near the bottom of the screen and turns
 * the map with the direction of travel; `tilt` adds the 3D driver view;
 * otherwise the whole route to the stop is shown. Dragging the map switches
 * follow off (reported through `onFollowChange`).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { isValidCoordinate, type LatLng } from '../../utils/geo';

let WebViewComponent: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RNWebView = require('react-native-webview');
  WebViewComponent = RNWebView.WebView || RNWebView.default || RNWebView;
} catch (err: any) {
  console.warn('[NavMap] react-native-webview native module not available:', err?.message);
}

const MAPLIBRE_VERSION = '5.24.0'; // same major/minor as the web dashboard
const DEFAULT_CENTER: LatLng = { latitude: 24.7136, longitude: 46.6753 }; // Riyadh

export interface NavMapMarker {
  coordinate: LatLng;
  title?: string | null;
}

export interface NavMapProps {
  pickup?: NavMapMarker | null;
  destination?: NavMapMarker | null;
  driverPosition?: (LatLng & { heading?: number | null }) | null;
  routeCoordinates?: LatLng[] | null;
  follow: boolean;
  tilt: boolean;
  night: boolean;
  onFollowChange?: (follow: boolean) => void;
  style?: StyleProp<ViewStyle>;
}

function buildHtml(center: LatLng): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css" />
<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js"></script>
<style>
  html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #f6f4ef; }
  .maplibregl-ctrl-attrib { font-size: 9px; }
  .puck { width: 46px; height: 46px; border-radius: 50%; background: rgba(37,99,235,0.18); display: flex; align-items: center; justify-content: center; }
  .puck-in { width: 30px; height: 30px; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3); display: flex; align-items: center; justify-content: center; }
  .pin { width: 26px; height: 26px; border-radius: 50%; border: 4px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3); box-sizing: border-box; }
  .pin-dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; margin: 5px auto 0; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  function post(msg) { try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {} }
  if (typeof maplibregl === 'undefined') { post({ type: 'MAP_ERROR', reason: 'maplibre-gl did not load' }); }

  var STYLES = { day: 'https://tiles.openfreemap.org/styles/liberty', night: 'https://tiles.openfreemap.org/styles/dark' };
  // Mirrors web-dashboard liveMapStyle.ts PALETTE (Apple Maps / CarPlay look).
  var PALETTE = {
    day: {
      background: { 'background-color': '#f6f4ef' },
      landuse_residential: { 'fill-color': '#efece5', 'fill-opacity': 0.9 },
      park: { 'fill-color': '#c9e7b8', 'fill-opacity': 0.95 },
      landcover_grass: { 'fill-color': '#d3ebc3', 'fill-opacity': 0.9 },
      landcover_wood: { 'fill-color': '#bfe0aa', 'fill-opacity': 0.9 },
      landcover_sand: { 'fill-color': '#f3e7c9', 'fill-opacity': 0.85 },
      water: { 'fill-color': '#a5d4f7' },
      waterway_river: { 'line-color': '#a5d4f7' },
      building: { 'fill-color': '#e8e4dc', 'fill-outline-color': '#dcd6cb' },
      road_motorway: { 'line-color': '#f9c46b' },
      road_motorway_casing: { 'line-color': '#e0a340' },
      road_motorway_link: { 'line-color': '#f9c46b' },
      road_trunk_primary: { 'line-color': '#fde7a6' },
      road_trunk_primary_casing: { 'line-color': '#e9c878' },
      road_secondary_tertiary: { 'line-color': '#ffffff' },
      road_secondary_tertiary_casing: { 'line-color': '#ddd7cc' },
      road_minor: { 'line-color': '#ffffff' },
      road_minor_casing: { 'line-color': '#e2ddd3' }
    },
    night: {
      background: { 'background-color': '#1a2230' },
      landuse_residential: { 'fill-color': '#1e2735', 'fill-opacity': 0.9 },
      landuse_park: { 'fill-color': '#1d3a2e', 'fill-opacity': 0.95 },
      landcover_wood: { 'fill-color': '#1b3529', 'fill-opacity': 0.9 },
      water: { 'fill-color': '#173a58' },
      waterway: { 'line-color': '#1d4466' },
      building: { 'fill-color': '#242e3d' },
      highway_minor: { 'line-color': '#2d3849' },
      highway_major_casing: { 'line-color': '#242d3b' },
      highway_major_inner: { 'line-color': '#3b475b' },
      highway_motorway_casing: { 'line-color': '#2a3342' },
      highway_motorway_inner: { 'line-color': '#56657c' }
    }
  };
  var HIDDEN = { day: ['building-3d'], night: [] };
  var ROUTE = { day: '#1a73e8', night: '#3fa9ff' };
  var EXTRUSION = { day: '#e6e1d8', night: '#2a3342' };

  var state = { data: null, mode: { follow: true, tilt: true, night: false }, theme: null, camKey: '' };
  var markers = { driver: null, pickup: null, destination: null };
  var lastProgrammaticMove = 0;
  // Our layers exist (set on style.load). map.isStyleLoaded() is not used: it
  // stays false while tiles download, which dropped the first update.
  var styleReady = false;

  var map = new maplibregl.Map({
    container: 'map',
    style: STYLES.day,
    center: [${center.longitude}, ${center.latitude}],
    zoom: 12,
    attributionControl: { compact: true },
    maxPitch: 70
  });

  function theme() { return state.mode.night ? 'night' : 'day'; }

  function applyPalette(t) {
    var p = PALETTE[t];
    Object.keys(p).forEach(function (id) {
      if (!map.getLayer(id)) return;
      Object.keys(p[id]).forEach(function (prop) { try { map.setPaintProperty(id, prop, p[id][prop]); } catch (e) {} });
    });
    HIDDEN[t].forEach(function (id) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); });
  }

  function firstSymbolId() {
    var layers = map.getStyle().layers || [];
    for (var i = 0; i < layers.length; i++) if (layers[i].type === 'symbol') return layers[i].id;
    return undefined;
  }

  function addOwnLayers(t) {
    var before = firstSymbolId();
    if (map.getSource('openmaptiles') && !map.getLayer('nav-3d-buildings')) {
      map.addLayer({
        id: 'nav-3d-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
        paint: {
          'fill-extrusion-color': EXTRUSION[t],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.75
        }
      }, before);
    }
    if (!map.getSource('route')) map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer('route-glow')) map.addLayer({ id: 'route-glow', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ROUTE[t], 'line-width': 16, 'line-opacity': 0.22, 'line-blur': 2 } }, before);
    if (!map.getLayer('route-line')) map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ROUTE[t], 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 7, 18, 11] } }, before);
  }

  function pinEl(color) {
    var el = document.createElement('div');
    el.className = 'pin'; el.style.background = color;
    var dot = document.createElement('div'); dot.className = 'pin-dot'; el.appendChild(dot);
    return el;
  }
  function puckEl() {
    var el = document.createElement('div'); el.className = 'puck';
    el.innerHTML = '<div class="puck-in"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="#2563EB"/></svg></div>';
    return el;
  }
  function setMarker(key, lngLat, make, opts) {
    if (!lngLat) { if (markers[key]) { markers[key].remove(); markers[key] = null; } return; }
    if (!markers[key]) markers[key] = new maplibregl.Marker(Object.assign({ element: make() }, opts || {})).setLngLat(lngLat).addTo(map);
    else markers[key].setLngLat(lngLat);
  }

  function ll(c) { return c ? [c.longitude, c.latitude] : null; }

  function updateCamera(force) {
    var d = state.data || {};
    var m = state.mode;
    var drv = d.driver;
    var key = [m.follow, m.tilt, drv ? drv.latitude.toFixed(5) + ',' + drv.longitude.toFixed(5) + ',' + Math.round(drv.heading || 0) : '-'].join('|');
    if (!force && key === state.camKey) return;
    state.camKey = key;
    lastProgrammaticMove = Date.now();
    if (m.follow && drv) {
      map.easeTo({
        center: [drv.longitude, drv.latitude],
        zoom: m.tilt ? 17 : 16,
        pitch: m.tilt ? 62 : 0,
        bearing: drv.heading || 0,
        padding: { top: 200, bottom: 330, left: 0, right: 0 },
        duration: 1000, essential: true
      });
      return;
    }
    var pts = [];
    if (d.route && d.route.length) d.route.forEach(function (c) { pts.push([c.longitude, c.latitude]); });
    [d.pickup, d.destination].forEach(function (mk) { if (mk) pts.push(ll(mk.coordinate)); });
    if (drv) pts.push([drv.longitude, drv.latitude]);
    if (pts.length === 0) return;
    if (pts.length === 1) { map.easeTo({ center: pts[0], zoom: 14, pitch: 0, bearing: 0, duration: 800 }); return; }
    var b = new maplibregl.LngLatBounds(pts[0], pts[0]);
    pts.forEach(function (p) { b.extend(p); });
    map.fitBounds(b, { padding: { top: 210, bottom: 350, left: 60, right: 70 }, maxZoom: 15, pitch: 0, bearing: 0, duration: 900 });
  }

  function render(forceCamera) {
    var d = state.data || {};
    var src = map.getSource('route');
    if (src) src.setData({ type: 'FeatureCollection', features: d.route && d.route.length > 1
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: d.route.map(function (c) { return [c.longitude, c.latitude]; }) } }]
      : [] });
    setMarker('pickup', d.pickup ? ll(d.pickup.coordinate) : null, function () { return pinEl('#2563EB'); });
    setMarker('destination', d.destination ? ll(d.destination.coordinate) : null, function () { return pinEl('#D94E38'); });
    setMarker('driver', d.driver ? [d.driver.longitude, d.driver.latitude] : null, puckEl, { rotationAlignment: 'map', pitchAlignment: 'map' });
    if (markers.driver && d.driver) markers.driver.setRotation(d.driver.heading || 0);
    updateCamera(forceCamera);
  }

  map.on('style.load', function () {
    styleReady = true;
    var t = theme();
    state.theme = t;
    applyPalette(t);
    addOwnLayers(t);
    render(true);
    post({ type: 'MAP_READY' });
  });

  // The driver panning the map means "let me look around": stop following.
  map.on('dragstart', function () {
    if (Date.now() - lastProgrammaticMove < 300) return;
    if (state.mode.follow) { state.mode.follow = false; post({ type: 'FOLLOW_OFF' }); }
  });

  window.updateData = function (payload) {
    try {
      var modeChanged = payload.mode && (payload.mode.follow !== state.mode.follow || payload.mode.tilt !== state.mode.tilt);
      var nightChanged = payload.mode && payload.mode.night !== state.mode.night;
      state.data = payload.data;
      if (payload.mode) state.mode = payload.mode;
      if (nightChanged && state.theme) { styleReady = false; map.setStyle(STYLES[theme()]); return; } // style.load re-renders
      if (styleReady) render(modeChanged);
    } catch (e) {}
  };
</script>
</body>
</html>`;
}

export function NavMap({ pickup, destination, driverPosition, routeCoordinates, follow, tilt, night, onFollowChange, style }: NavMapProps) {
  const webViewRef = useRef<any>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Fixed at mount: changing it would reload the whole page.
  const [initialCenter] = useState<LatLng>(() =>
    (driverPosition && isValidCoordinate(driverPosition.latitude, driverPosition.longitude) && driverPosition) ||
    pickup?.coordinate || destination?.coordinate || DEFAULT_CENTER,
  );
  const html = useMemo(() => buildHtml(initialCenter), [initialCenter]);

  const payload = useMemo(() => {
    const valid = (m?: NavMapMarker | null) => (m && isValidCoordinate(m.coordinate.latitude, m.coordinate.longitude) ? m : null);
    const driver = driverPosition && isValidCoordinate(driverPosition.latitude, driverPosition.longitude)
      ? { latitude: driverPosition.latitude, longitude: driverPosition.longitude, heading: driverPosition.heading ?? null }
      : null;
    const route = (routeCoordinates ?? []).filter((c) => isValidCoordinate(c.latitude, c.longitude));
    return JSON.stringify({
      data: { pickup: valid(pickup), destination: valid(destination), driver, route },
      mode: { follow, tilt, night },
    });
  }, [pickup, destination, driverPosition, routeCoordinates, follow, tilt, night]);

  const sync = useCallback(() => {
    if (!readyRef.current || !webViewRef.current) return;
    webViewRef.current.injectJavaScript(`window.updateData(${payload}); true;`);
  }, [payload]);

  useEffect(() => { sync(); }, [sync]);

  const onMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent?.data ?? '{}');
      if (msg.type === 'MAP_READY') {
        readyRef.current = true;
        setReady(true);
        sync();
      } else if (msg.type === 'FOLLOW_OFF') {
        onFollowChange?.(false);
      } else if (msg.type === 'MAP_ERROR') {
        setFailed(true);
      }
    } catch {
      // ignore malformed messages
    }
  }, [onFollowChange, sync]);

  if (!WebViewComponent) {
    return (
      <View style={[styles.container, style, styles.center]}>
        <Text style={styles.note}>Map unavailable on this build.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebViewComponent
        ref={webViewRef}
        source={{ html }}
        style={styles.webView}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled={false}
        androidLayerType="hardware"
        onMessage={onMessage}
        scrollEnabled={false}
        overScrollMode="never"
      />
      {!ready && (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.loading]}>
          {failed ? (
            <Text style={styles.note}>Map could not load. Check the internet connection.</Text>
          ) : (
            <>
              <ActivityIndicator size="large" color="#FA634E" />
              <Text style={styles.note}>Loading map…</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, backgroundColor: '#f6f4ef' },
  webView: { flex: 1, backgroundColor: '#f6f4ef' },
  center: { alignItems: 'center', justifyContent: 'center' },
  loading: { backgroundColor: '#f6f4ef', zIndex: 10 },
  note: { marginTop: 8, color: '#64748B', fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 24 },
});
