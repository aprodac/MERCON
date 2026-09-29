/**
 * Every truck with a known position on one MapLibre map (same tiles as the
 * trip map). Marker colour is the trip: delayed → red, otherwise ink. A truck
 * whose GPS has gone quiet is drawn faded, whatever its colour — the two are
 * independent (a delayed truck can also be silent), same as on Home.
 * Used full-screen on the Fleet map page and as a small, non-interactive
 * preview on Home. Falls back to a plain panel on builds without MapLibre.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TurboModuleRegistry } from 'react-native';
import { MapPin, Truck } from 'lucide-react-native';
import type { LiveUnit } from '../../lib/operator';
import { MAP_STYLE_URL } from '../trips/details/components/TripMap';

const hasNativeMap = (() => {
  try {
    return !!TurboModuleRegistry.get('MLRNNetworkModule');
  } catch {
    return false;
  }
})();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ML: typeof import('@maplibre/maplibre-react-native') | null = hasNativeMap ? require('@maplibre/maplibre-react-native') : null;

export type UnitState = 'delayed' | 'silent' | 'moving';

export const STATE_STYLE: Record<UnitState, { color: string; label: string }> = {
  delayed: { color: '#D92D20', label: 'Delayed' },
  silent: { color: '#9898A4', label: 'No GPS' },
  moving: { color: '#18181B', label: 'On the road' },
};

/** GPS older than this counts as silent (same threshold as Needs action). */
const QUIET_MS = 30 * 60_000;

export const isDelayed = (u: LiveUnit) => u.trip?.phase === 'delayed';
export function isSilent(u: LiveUnit, now = Date.now()): boolean {
  const seen = u.position?.recorded_at ? new Date(u.position.recorded_at).getTime() : 0;
  return !u.position || now - seen > QUIET_MS;
}
/** One label for the card: delayed wins, then silent. */
export function unitState(u: LiveUnit, now = Date.now()): UnitState {
  return isDelayed(u) ? 'delayed' : isSilent(u, now) ? 'silent' : 'moving';
}

const located = (u: LiveUnit) =>
  !!u.position && Number.isFinite(u.position.lat) && Number.isFinite(u.position.lng) && !(u.position.lat === 0 && u.position.lng === 0);

interface Props {
  units: LiveUnit[];
  selected?: string | null;
  onSelect?: (key: string | null) => void;
  interactive?: boolean;
  /** Extra space kept clear at the top/bottom (overlaid controls, the card). */
  padding?: { top: number; bottom: number };
}

export function FleetMap({ units, selected, onSelect, interactive = false, padding = { top: 40, bottom: 40 } }: Props) {
  const points = useMemo(() => units.filter(located), [units]);

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    let [w, s, e, n] = [points[0].position!.lng, points[0].position!.lat, points[0].position!.lng, points[0].position!.lat];
    for (const u of points) {
      w = Math.min(w, u.position!.lng); e = Math.max(e, u.position!.lng);
      s = Math.min(s, u.position!.lat); n = Math.max(n, u.position!.lat);
    }
    if (e - w < 0.05) { w -= 0.1; e += 0.1; }
    if (n - s < 0.05) { s -= 0.1; n += 0.1; }
    return [w, s, e, n] as [number, number, number, number];
  }, [points]);

  if (!ML || !bounds) {
    return (
      <View style={[StyleSheet.absoluteFill, st.fallback]}>
        <MapPin size={22} color="#52525B" />
        <Text style={st.fallbackText}>{!bounds ? 'No truck locations yet' : 'Map needs the latest app update'}</Text>
      </View>
    );
  }

  const { Map, Camera, ViewAnnotation } = ML;
  const now = Date.now();

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
        <Camera initialViewState={{ bounds, padding: { top: padding.top, bottom: padding.bottom, left: 50, right: 50 } }} />
      ) : (
        <Camera bounds={bounds} padding={{ top: padding.top, bottom: padding.bottom, left: 30, right: 30 }} duration={0} />
      )}

      {points.map((u) => {
        const color = isDelayed(u) ? STATE_STYLE.delayed.color : STATE_STYLE.moving.color;
        const on = selected === u.key;
        const marker = (
          <View style={[st.pin, { backgroundColor: color }, isSilent(u, now) && !on && { opacity: 0.45 }, on && st.pinOn]}>
            <Truck size={on ? 16 : 13} color="#FFFFFF" strokeWidth={2.3} />
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
  pinOn: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
});
