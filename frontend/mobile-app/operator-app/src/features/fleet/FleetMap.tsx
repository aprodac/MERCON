/**
 * Trucks on one MapLibre map (same tiles as the trip map).
 *   Marker colour: delayed trip → red · on a trip → ink · free → white.
 *   A truck whose GPS has gone quiet is drawn faded, whatever its colour —
 *   independent of delay, same as Home. A moving truck shows its heading.
 * The selected truck gets its plate label, and its trip's stops and route
 * are drawn. `focus` (a city from search, or the selection) moves the camera.
 * Used full-screen on the Fleet map page and as a small, non-interactive
 * preview on Home. Falls back to a plain panel on builds without MapLibre.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TurboModuleRegistry } from 'react-native';
import { MapPin, Navigation, Truck } from 'lucide-react-native';
import type { LiveUnit } from '../../lib/operator';
import { MAP_STYLE_URL } from '../trips/details/components/TripMap';
import { isDelayed, isFree, isSilent } from './fleetModel';

const hasNativeMap = (() => {
  try {
    return !!TurboModuleRegistry.get('MLRNNetworkModule');
  } catch {
    return false;
  }
})();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ML: typeof import('@maplibre/maplibre-react-native') | null = hasNativeMap ? require('@maplibre/maplibre-react-native') : null;

export type UnitState = 'delayed' | 'silent' | 'moving' | 'free';

export const STATE_STYLE: Record<UnitState, { color: string; label: string }> = {
  delayed: { color: '#D92D20', label: 'Delayed' },
  silent: { color: '#9898A4', label: 'No GPS' },
  moving: { color: '#18181B', label: 'On a trip' },
  free: { color: '#FFFFFF', label: 'Free' },
};

/** One label for a card: delayed wins, then silent, then trip / free. */
export function unitState(u: LiveUnit, now = Date.now()): UnitState {
  return isDelayed(u) ? 'delayed' : isSilent(u, now) ? 'silent' : isFree(u) ? 'free' : 'moving';
}

const located = (u: LiveUnit) =>
  !!u.position && Number.isFinite(u.position.lat) && Number.isFinite(u.position.lng) && !(u.position.lat === 0 && u.position.lng === 0);

type Bounds = [number, number, number, number];

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

interface Props {
  units: LiveUnit[];
  selected?: string | null;
  onSelect?: (key: string | null) => void;
  interactive?: boolean;
  /** A place to frame (city search): its centre and radius in km. */
  focus?: { lat: number; lng: number; km: number } | null;
  /** Extra space kept clear at the top/bottom (overlaid controls, the card). */
  padding?: { top: number; bottom: number };
}

export function FleetMap({ units, selected, onSelect, interactive = false, focus, padding = { top: 40, bottom: 40 } }: Props) {
  const points = useMemo(() => units.filter(located), [units]);
  const bounds = useMemo(() => boundsOf(points.map((u) => u.position!)), [points]);
  const sel = points.find((u) => u.key === selected) ?? null;
  const camera = useRef<any>(null);
  const pad = { top: padding.top, bottom: padding.bottom, left: 50, right: 50 };

  // The selected truck's trip: its stops, and the line through them.
  const stops = useMemo(() => (sel?.trip?.stops ?? []).filter((s) => s.lat != null && s.lng != null && !(s.lat === 0 && s.lng === 0)), [sel]);
  const route = useMemo<GeoJSON.Feature>(() => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: stops.map((s) => [s.lng!, s.lat!]) },
  }), [stops]);

  // Selecting a truck frames it with the rest of its trip; a city search frames the city.
  useEffect(() => {
    if (!interactive || !camera.current) return;
    if (sel) {
      const b = boundsOf([sel.position!, ...stops.map((s) => ({ lat: s.lat!, lng: s.lng! }))], 0.02, 0.05);
      if (b) camera.current.fitBounds(b, { padding: pad, duration: 700 });
    } else if (focus) {
      const d = focus.km / 111;
      camera.current.fitBounds([focus.lng - d, focus.lat - d, focus.lng + d, focus.lat + d], { padding: pad, duration: 700 });
    }
    // pad is derived from padding; re-running on it would refit on every card height change.
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

  const { Map, Camera, GeoJSONSource, Layer, ViewAnnotation } = ML;
  const now = Date.now();
  const nextIdx = sel?.trip?.next_stop_index ?? -1;

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={MAP_STYLE_URL}
      logo={false}
      compass={false}
      scaleBar={false}
      attributionPosition={{ bottom: padding.bottom + 4, right: 8 }}
      dragPan={interactive}
      touchZoom={interactive}
      doubleTapZoom={interactive}
      touchRotate={false}
      touchPitch={false}
      onPress={interactive && onSelect ? () => onSelect(null) : undefined}
    >
      {interactive ? (
        <Camera ref={camera} initialViewState={{ bounds, padding: pad }} />
      ) : (
        <Camera bounds={bounds} padding={{ top: padding.top, bottom: padding.bottom, left: 30, right: 30 }} duration={0} />
      )}

      {stops.length > 1 ? (
        <GeoJSONSource id="sel-route" data={route}>
          <Layer id="sel-route-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#FFFFFF', 'line-width': 7 }} />
          <Layer id="sel-route-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#18181B', 'line-width': 3, 'line-dasharray': [2, 1.5] }} />
        </GeoJSONSource>
      ) : null}

      {stops.map((s, i) => {
        const done = !!s.actual_arrival;
        const isNext = sel?.trip?.stops.indexOf(s) === nextIdx;
        return (
          <ViewAnnotation key={`stop-${s.id}`} id={`stop-${s.id}`} lngLat={[s.lng!, s.lat!]} anchor="center">
            <View style={[st.stop, done && st.stopDone, isNext && st.stopNext]}>
              <Text style={[st.stopText, (done || isNext) && { color: '#FFFFFF' }]}>{i + 1}</Text>
            </View>
          </ViewAnnotation>
        );
      })}

      {points.map((u) => {
        const free = isFree(u);
        const color = isDelayed(u) ? STATE_STYLE.delayed.color : free ? '#FFFFFF' : STATE_STYLE.moving.color;
        const fg = free ? '#18181B' : '#FFFFFF';
        const on = selected === u.key;
        const silent = isSilent(u, now);
        const heading = u.position?.heading;
        const moving = u.motion === 'moving' && heading != null && !silent;
        const marker = (
          <View style={{ alignItems: 'center' }}>
            <View style={[st.pin, { backgroundColor: color }, free && st.pinFree, silent && !on && { opacity: 0.45 }, on && st.pinOn]}>
              {moving ? (
                <Navigation size={on ? 15 : 12} color={fg} fill={fg} strokeWidth={2} style={{ transform: [{ rotate: `${heading}deg` }] }} />
              ) : (
                <Truck size={on ? 16 : 13} color={fg} strokeWidth={2.3} />
              )}
            </View>
            {on && u.vehicle?.plate_number ? <View style={st.label}><Text style={st.labelText}>{u.vehicle.plate_number}</Text></View> : null}
          </View>
        );
        return (
          <ViewAnnotation key={u.key} id={`unit-${u.key}`} lngLat={[u.position!.lng, u.position!.lat]} anchor="center">
            {interactive && onSelect ? (
              <TouchableOpacity onPress={() => onSelect(u.key)} hitSlop={10} activeOpacity={0.8}>{marker}</TouchableOpacity>
            ) : marker}
          </ViewAnnotation>
        );
      })}
    </Map>
  );
}

const st = StyleSheet.create({
  fallback: { backgroundColor: '#EFEFF1', alignItems: 'center', justifyContent: 'center', gap: 8 },
  fallbackText: { fontSize: 13, fontWeight: '600', color: '#52525B' },
  pin: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  pinFree: { borderColor: '#18181B', borderWidth: 1.5 },
  pinOn: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
  label: { marginTop: 3, backgroundColor: '#18181B', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  labelText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', fontFamily: 'monospace' },
  stop: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#71717A', alignItems: 'center', justifyContent: 'center' },
  stopDone: { backgroundColor: '#16A34A', borderColor: '#FFFFFF' },
  stopNext: { backgroundColor: '#2563EB', borderColor: '#FFFFFF' },
  stopText: { fontSize: 10, fontWeight: '800', color: '#3F3F46' },
});
