/**
 * Trucks on one MapLibre map — the phone version of the web's FleetCommandMap.
 *
 *   Marker colour: delayed trip → red · on a trip → ink · free → white.
 *   Trucks close together on screen merge into a numbered group (red badge =
 *   how many in it are delayed). Tapping a group zooms in until they part;
 *   trucks parked in the same yard never part, so their list opens instead.
 *   Pins are native Markers with their own onPress — a touchable inside a map
 *   annotation never gets the tap — and draw PNG icons, which annotations
 *   show reliably where SVG icons came out blank.
 *   A truck whose GPS has gone quiet is drawn faded, whatever its colour
 *   (independent of delay, same as Home). A moving truck shows its heading.
 *   The selected truck gets its plate label, its road route to the next stop
 *   (real roads when routing is up, dashed straight line otherwise) and its
 *   trip's numbered stops.
 *
 * Views (driven through the ref, like the web map's controls):
 *   2D / 3D       flat, or tilted 55° — Liberty's 3D buildings rise from ~z14
 *   Driver view   low behind the selected truck, facing where it's going
 *   Trip overview flat and north-up, framing the truck and every stop
 *   Fit all · Face north · Zoom in / out; light or dark basemap.
 * Used full-screen on the Fleet map page and as a small, non-interactive
 * preview on Home. Falls back to a plain panel on builds without MapLibre.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, TurboModuleRegistry, useWindowDimensions } from 'react-native';
import { MapPin } from 'lucide-react-native';
import Supercluster from 'supercluster';
import type { LiveUnit } from '../../lib/operator';
import { isDelayed, isFree, isSilent, located } from './fleetModel';
import { quietOfflineTileErrors } from '../../lib/mapLogs';

const hasNativeMap = (() => {
  try {
    return !!TurboModuleRegistry.get('MLRNNetworkModule');
  } catch {
    return false;
  }
})();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ML: typeof import('@maplibre/maplibre-react-native') | null = hasNativeMap ? require('@maplibre/maplibre-react-native') : null;
quietOfflineTileErrors(ML);

/** OpenFreeMap vector basemaps, the same pair as the web live map. */
export const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;
export type MapTheme = keyof typeof MAP_STYLES;

export type UnitState = 'delayed' | 'silent' | 'moving' | 'free';

export const STATE_STYLE: Record<UnitState, { color: string; label: string }> = {
  delayed: { color: '#FA634E', label: 'Delayed' },
  silent: { color: '#9898A4', label: 'No GPS' },
  moving: { color: '#3E3C3D', label: 'On a trip' },
  free: { color: '#FFFFFF', label: 'Free' },
};

/** One label for a card: delayed wins, then silent, then trip / free. */
export function unitState(u: LiveUnit, now = Date.now()): UnitState {
  return isDelayed(u) ? 'delayed' : isSilent(u, now) ? 'silent' : isFree(u) ? 'free' : 'moving';
}

const ICONS = {
  truckInk: require('./icons/truck-ink.png'),
  truckWhite: require('./icons/truck-white.png'),
  // Drawn pointing north, so the heading is the rotation.
  navInk: require('./icons/nav-ink.png'),
  navWhite: require('./icons/nav-white.png'),
};

/** Trucks closer than this many screen pixels merge into a group. */
const GROUP_RADIUS_PX = 50;
/** From this zoom up every truck is drawn on its own. */
const GROUP_MAX_ZOOM = 14;

type GroupProps = { key: string; delayed: number };

type Bounds = [number, number, number, number];
type LngLat = [number, number];

function boundsOf(pts: { lat: number; lng: number }[], minSpan = 0.05, pad = 0.1): Bounds | null {
  if (pts.length === 0) return null;
  let [w, s, e, n] = [pts[0].lng, pts[0].lat, pts[0].lng, pts[0].lat];
  for (const p of pts) {
    w = Math.min(w, p.lng); e = Math.max(e, p.lng); s = Math.min(s, p.lat); n = Math.max(n, p.lat);
  }
  if (e - w < minSpan) { w -= pad; e += pad; }
  if (n - s < minSpan) { s -= pad; n += pad; }
  return [w, s, e, n];
}

/** Compass bearing from a to b, degrees clockwise from north. */
function bearingBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** The camera state the page shows controls for. */
export interface MapView { zoom: number; pitch: number; bearing: number }
export type FocusMode = 'none' | 'driver' | 'overview';

export interface FleetMapHandle {
  fitAll(): void;
  zoomBy(delta: number): void;
  faceNorth(): void;
  set3D(on: boolean): void;
  driverView(): void;
  tripOverview(): void;
}

interface Props {
  units: LiveUnit[];
  selected?: string | null;
  onSelect?: (key: string | null) => void;
  interactive?: boolean;
  theme?: MapTheme;
  /** Tilted by default when a truck is picked (the 3D toggle's state). */
  tilted?: boolean;
  /** Driver view / trip overview show only the selected truck. */
  focusMode?: FocusMode;
  /** Road route from the selected truck to its next stop; null → dashed straight line. */
  routeLine?: LngLat[] | null;
  /** A place to frame (city search): its centre and radius in km. */
  focus?: { lat: number; lng: number; km: number } | null;
  /** Extra space kept clear at the top/bottom (overlaid controls, the card). */
  padding?: { top: number; bottom: number };
  onViewChange?: (v: MapView) => void;
  /** A group of trucks that sit on the same spot was tapped — show them as a list. */
  onGroupPress?: (keys: string[]) => void;
}

export const FleetMap = forwardRef<FleetMapHandle, Props>(function FleetMap({
  units, selected, onSelect, interactive = false, theme = 'light', tilted = false, focusMode = 'none',
  routeLine, focus, padding = { top: 40, bottom: 40 }, onViewChange, onGroupPress,
}, ref) {
  const { height } = useWindowDimensions();
  const points = useMemo(() => units.filter(located), [units]);
  const bounds = useMemo(() => boundsOf(points.map((u) => u.position!)), [points]);
  const sel = points.find((u) => u.key === selected) ?? null;
  const camera = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const zoomRef = useRef(5);
  const [view, setView] = useState<MapView>({ zoom: 5, pitch: 0, bearing: 0 });
  // What's on screen when the camera settles — drives grouping.
  const [area, setArea] = useState<{ bbox: Bounds; zoom: number } | null>(null);
  const pad = { top: padding.top, bottom: padding.bottom, left: 50, right: 50 };

  // The selected truck's trip: its stops (numbered) and where it's heading.
  const stops = useMemo(() => (sel?.trip?.stops ?? []).filter((s) => s.lat != null && s.lng != null && !(s.lat === 0 && s.lng === 0)), [sel]);
  const next = sel?.trip && sel.trip.next_stop_index != null ? sel.trip.stops[sel.trip.next_stop_index] : null;
  const toNext = useMemo<GeoJSON.Feature | null>(() => {
    if (!sel?.position || !next || next.lat == null || next.lng == null) return null;
    const coords = routeLine && routeLine.length > 1 ? routeLine : [[sel.position.lng, sel.position.lat], [next.lng, next.lat]];
    return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
  }, [sel?.position, next, routeLine]);

  // Group nearby trucks; the picked one always stands on its own.
  const groupIndex = useMemo(() => {
    const index = new Supercluster<GroupProps, { delayed: number }>({
      radius: GROUP_RADIUS_PX,
      maxZoom: GROUP_MAX_ZOOM,
      map: (p) => ({ delayed: p.delayed }),
      reduce: (acc, p) => { acc.delayed += p.delayed; },
    });
    index.load(points.filter((u) => u.key !== selected).map((u) => ({
      type: 'Feature' as const,
      properties: { key: u.key, delayed: isDelayed(u) ? 1 : 0 },
      geometry: { type: 'Point' as const, coordinates: [u.position!.lng, u.position!.lat] },
    })));
    return index;
  }, [points, selected]);

  const { groups, singles } = useMemo(() => {
    const out = { groups: [] as { id: number; lng: number; lat: number; count: number; delayed: number }[], singles: [] as LiveUnit[] };
    if (focusMode !== 'none' && sel) { out.singles = [sel]; return out; }
    const byKey = new globalThis.Map(points.map((u) => [u.key, u]));
    const bbox = area?.bbox ?? bounds;
    if (!bbox) return out;
    // A little past the screen edge, so groups don't pop in while panning.
    const [w, s, e, n] = bbox;
    const dx = (e - w) * 0.2;
    const dy = (n - s) * 0.2;
    for (const f of groupIndex.getClusters([w - dx, Math.max(-85, s - dy), e + dx, Math.min(85, n + dy)], Math.floor(area?.zoom ?? zoomRef.current))) {
      const [lng, lat] = f.geometry.coordinates;
      const p = f.properties as Partial<GroupProps> & { cluster?: boolean; cluster_id?: number; point_count?: number; delayed: number };
      if (p.cluster) out.groups.push({ id: p.cluster_id!, lng, lat, count: p.point_count!, delayed: p.delayed });
      else if (p.key && byKey.has(p.key)) out.singles.push(byKey.get(p.key)!);
    }
    if (sel) out.singles.push(sel);
    return out;
  }, [groupIndex, points, area, bounds, focusMode, sel]);

  const pressGroup = (g: { id: number; lng: number; lat: number }) => {
    const keys = groupIndex.getLeaves(g.id, Infinity).map((f) => (f.properties as GroupProps).key);
    const zoom = groupIndex.getClusterExpansionZoom(g.id);
    // Trucks in one yard stay together at every zoom — list them instead of zooming forever.
    if (zoom > GROUP_MAX_ZOOM && onGroupPress) { onGroupPress(keys); return; }
    camera.current?.easeTo?.({ center: [g.lng, g.lat], zoom: Math.min(zoom + 0.5, 16), padding: pad, duration: 600 });
  };

  const headingOf = (u: LiveUnit): number => {
    if (u.motion === 'moving' && u.position?.heading_deg != null) return u.position.heading_deg;
    if (routeLine && routeLine.length > 1) return bearingBetween({ lng: routeLine[0][0], lat: routeLine[0][1] }, { lng: routeLine[1][0], lat: routeLine[1][1] });
    if (u.position && next?.lat != null && next.lng != null) return bearingBetween(u.position, { lat: next.lat, lng: next.lng });
    return 0;
  };

  const flyToSelected = (u: LiveUnit, pitch: number) => {
    camera.current?.easeTo?.({
      center: [u.position!.lng, u.position!.lat],
      zoom: Math.max(zoomRef.current, 12.5),
      pitch,
      bearing: pitch > 0 && u.motion === 'moving' && u.position?.heading_deg != null ? u.position.heading_deg : 0,
      padding: pad,
      duration: 900,
    });
  };

  useImperativeHandle(ref, () => ({
    fitAll() {
      if (bounds) camera.current?.fitBounds(bounds, { padding: pad, pitch: 0, bearing: 0, duration: 800 });
    },
    zoomBy(delta: number) {
      camera.current?.zoomTo(Math.max(3, Math.min(19, zoomRef.current + delta)), { duration: 250 });
    },
    faceNorth() {
      mapRef.current?.getCenter().then((center: LngLat) => camera.current?.easeTo({ center, bearing: 0, pitch: 0, duration: 600 })).catch(() => {});
    },
    set3D(on: boolean) {
      if (sel?.position) { flyToSelected(sel, on ? 55 : 0); return; }
      mapRef.current?.getCenter()
        .then((center: LngLat) => camera.current?.easeTo({ center, pitch: on ? 55 : 0, zoom: on ? Math.max(zoomRef.current, 6) : zoomRef.current, duration: 700 }))
        .catch(() => {});
    },
    driverView() {
      if (!sel?.position) return;
      camera.current?.easeTo?.({
        center: [sel.position.lng, sel.position.lat],
        zoom: 17,
        pitch: 70,
        bearing: headingOf(sel),
        // The truck sits low on screen with the road ahead above it.
        padding: { ...pad, top: Math.round(height * 0.45) },
        duration: 1400,
      });
    },
    tripOverview() {
      if (!sel?.position) return;
      const b = boundsOf([sel.position, ...stops.map((s) => ({ lat: s.lat!, lng: s.lng! }))], 0.02, 0.05);
      if (b) camera.current?.fitBounds(b, { padding: pad, pitch: 0, bearing: 0, duration: 1000 });
    },
  }));

  // Picking a truck flies to it (tilted when 3D is on); a city search frames the city.
  useEffect(() => {
    if (!interactive || !camera.current) return;
    if (sel?.position) flyToSelected(sel, tilted ? 55 : 0);
    else if (focus) {
      const d = focus.km / 111;
      camera.current.fitBounds([focus.lng - d, focus.lat - d, focus.lng + d, focus.lat + d], { padding: pad, pitch: 0, bearing: 0, duration: 700 });
    }
    // Only a new selection or search moves the camera, not padding/tilt changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, sel?.key, focus?.lat, focus?.lng, focus?.km]);

  if (!ML || !bounds) {
    return (
      <View style={[StyleSheet.absoluteFill, st.fallback]}>
        <MapPin size={22} color="#52525B" />
        <Text style={st.fallbackText}>{!ML ? 'Map needs the latest app update' : 'No truck locations match'}</Text>
      </View>
    );
  }

  const { Map, Camera, GeoJSONSource, Layer, ViewAnnotation, Marker } = ML;
  const now = Date.now();
  const dark = theme === 'dark';
  // Markers stand upright but a heading arrow turns with the map.
  const mapBearing = view.bearing;

  return (
    <Map
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      mapStyle={MAP_STYLES[theme]}
      logo={false}
      compass={false}
      scaleBar={false}
      attribution={false}
      dragPan={interactive}
      touchZoom={interactive}
      doubleTapZoom={interactive}
      touchRotate={interactive}
      touchPitch={interactive}
      onPress={interactive && onSelect ? () => onSelect(null) : undefined}
      onRegionDidChange={(e) => {
        const v = { zoom: e.nativeEvent.zoom, pitch: e.nativeEvent.pitch, bearing: e.nativeEvent.bearing };
        zoomRef.current = v.zoom;
        setView(v);
        setArea({ bbox: e.nativeEvent.bounds, zoom: v.zoom });
        onViewChange?.(v);
      }}
    >
      {interactive ? (
        <Camera ref={camera} initialViewState={{ bounds, padding: pad }} />
      ) : (
        <Camera bounds={bounds} padding={{ top: padding.top, bottom: padding.bottom, left: 30, right: 30 }} duration={0} />
      )}

      {toNext ? (
        <GeoJSONSource id="to-next" data={toNext}>
          <Layer id="to-next-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': dark ? '#FF8A78' : '#FA634E', 'line-width': 12, 'line-opacity': 0.2, 'line-blur': 2 }} />
          {/* Separate layers, not a toggled prop: a dash set once on a native layer isn't cleared by dropping it. */}
          {routeLine && routeLine.length > 1 ? (
            <Layer key="road" id="to-next-road" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': dark ? '#FF8A78' : '#FA634E', 'line-width': 5 }} />
          ) : (
            <Layer key="straight" id="to-next-straight" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': dark ? '#FF8A78' : '#FA634E', 'line-width': 4, 'line-dasharray': [2, 1.5] }} />
          )}
        </GeoJSONSource>
      ) : null}

      {stops.map((s, i) => {
        const done = !!s.actual_arrival;
        const isNext = next?.id === s.id;
        return (
          <ViewAnnotation key={`stop-${s.id}`} id={`stop-${s.id}`} lngLat={[s.lng!, s.lat!]} anchor="center">
            <View style={[st.stop, done && st.stopDone, isNext && st.stopNext]}>
              <Text style={[st.stopText, (done || isNext) && { color: '#FFFFFF' }]}>{i + 1}</Text>
            </View>
          </ViewAnnotation>
        );
      })}

      {groups.map((g) => (
        <Marker key={`group-${g.id}`} id={`group-${g.id}`} lngLat={[g.lng, g.lat]} anchor="center" onPress={interactive ? () => pressGroup(g) : undefined}>
          <View style={[st.group, g.count >= 10 && st.groupBig, g.delayed > 0 && st.groupDelayed]}>
            <Text style={st.groupText}>{g.count}</Text>
            {g.delayed > 0 ? <View style={st.groupBadge}><Text style={st.groupBadgeText}>{g.delayed}</Text></View> : null}
          </View>
        </Marker>
      ))}

      {singles.map((u) => {
        const free = isFree(u);
        const color = isDelayed(u) ? STATE_STYLE.delayed.color : free ? '#FFFFFF' : STATE_STYLE.moving.color;
        const on = selected === u.key;
        const silent = isSilent(u, now);
        const heading = u.position?.heading_deg;
        const moving = u.motion === 'moving' && heading != null && !silent;
        const size = on ? 18 : 15;
        const icon = moving ? (free ? ICONS.navInk : ICONS.navWhite) : free ? ICONS.truckInk : ICONS.truckWhite;
        return (
          <Marker
            key={u.key}
            id={`unit-${u.key}`}
            lngLat={[u.position!.lng, u.position!.lat]}
            anchor="center"
            onPress={interactive && onSelect ? () => onSelect(u.key) : undefined}
          >
            <View style={{ alignItems: 'center' }}>
              <View style={[st.pin, { backgroundColor: color }, free && st.pinFree, on && st.pinOn]}>
                <Image
                  source={icon}
                  style={{ width: size, height: size, transform: moving ? [{ rotate: `${heading! - mapBearing}deg` }] : [] }}
                  fadeDuration={0}
                />
                {/* No signal: a small grey badge, so the pin itself stays readable */}
                {silent ? <View style={st.silent} /> : null}
              </View>
              {on && u.vehicle?.plate_number ? <View style={st.label}><Text style={st.labelText}>{u.vehicle.plate_number}</Text></View> : null}
            </View>
          </Marker>
        );
      })}
    </Map>
  );
});

const st = StyleSheet.create({
  fallback: { backgroundColor: '#EFEFF1', alignItems: 'center', justifyContent: 'center', gap: 8 },
  fallbackText: { fontSize: 13, fontWeight: '600', color: '#52525B' },
  pin: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  pinFree: { borderColor: '#3E3C3D', borderWidth: 2 },
  pinOn: { width: 42, height: 42, borderRadius: 21, borderWidth: 3 },
  silent: { position: 'absolute', top: -3, right: -3, width: 11, height: 11, borderRadius: 6, backgroundColor: '#9898A4', borderWidth: 2, borderColor: '#FFFFFF' },
  label: { marginTop: 3, backgroundColor: '#3E3C3D', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  labelText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', fontFamily: 'monospace' },
  group: {
    minWidth: 38, height: 38, borderRadius: 19, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#3E3C3D', borderWidth: 3, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  groupBig: { minWidth: 46, height: 46, borderRadius: 23 },
  groupDelayed: { borderColor: '#FA634E' },
  groupText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  groupBadge: {
    position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: '#FA634E', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  groupBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  stop: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#71717A', alignItems: 'center', justifyContent: 'center' },
  stopDone: { backgroundColor: '#3E3C3D', borderColor: '#FFFFFF' },
  stopNext: { backgroundColor: '#FA634E', borderColor: '#FFFFFF' },
  stopText: { fontSize: 10, fontWeight: '800', color: '#3F3F46' },
});
