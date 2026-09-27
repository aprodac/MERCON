/**
 * The trip on a MapLibre map (OpenFreeMap tiles, as on the web): the planned
 * route through the stops, the path actually driven, numbered stop markers and
 * the truck where GPS last saw it.
 *
 * MapLibre is native code. A build made before it was added doesn't have it,
 * so the map falls back to a plain card with an "Open in Maps" button instead
 * of crashing.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, TurboModuleRegistry } from 'react-native';
import { MapPin, Truck } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { TripOverview, TripPhase } from '../../../../lib/operator';
import { mapsLink, type Stop } from '../tripDetailsModel';

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// getEnforcing() in the library throws at import time when the native side is
// missing, so check first and only then load it.
const hasNativeMap = (() => {
  try {
    return !!TurboModuleRegistry.get('MLRNNetworkModule');
  } catch {
    return false;
  }
})();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ML: typeof import('@maplibre/maplibre-react-native') | null = hasNativeMap ? require('@maplibre/maplibre-react-native') : null;

const ROUTE = '#E0503B';
const DONE = '#1F9D55';
const NEXT = '#2F5FD0';

interface Props {
  stops: Stop[];
  overview: TripOverview | null;
  phase: TripPhase;
  /** Fixed height; leave out to fill the parent. */
  height?: number;
  interactive?: boolean;
  /** Extra space kept clear at the top/bottom (overlaid buttons, the sheet). */
  padding?: { top: number; bottom: number };
}

type LngLat = [number, number];

const valid = (s: Stop) =>
  Number.isFinite(s.location_lat) && Number.isFinite(s.location_lng) && !(s.location_lat === 0 && s.location_lng === 0);

export function TripMap({ stops, overview, phase, height, interactive = false, padding = { top: 60, bottom: 40 } }: Props) {
  const points = useMemo(() => stops.filter(valid), [stops]);
  const truck = overview?.unit?.position ?? null;
  const path = useMemo(() => overview?.path ?? [], [overview?.path]);
  const nextIdx = phase === 'active' ? points.findIndex((s) => !s.actual_arrival) : -1;

  const bounds = useMemo(() => {
    const all: LngLat[] = [
      ...points.map((s) => [s.location_lng, s.location_lat] as LngLat),
      ...(truck && phase === 'active' ? [[truck.lng, truck.lat] as LngLat] : []),
    ];
    if (all.length === 0) return null;
    let [w, s, e, n] = [all[0][0], all[0][1], all[0][0], all[0][1]];
    for (const [x, y] of all) {
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
    }
    // A single point still needs a box to frame.
    if (e - w < 0.02) { w -= 0.05; e += 0.05; }
    if (n - s < 0.02) { s -= 0.05; n += 0.05; }
    return [w, s, e, n] as [number, number, number, number];
  }, [points, truck, phase]);

  const planned = useMemo<GeoJSON.Feature>(() => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: points.map((s) => [s.location_lng, s.location_lat]) },
  }), [points]);

  const driven = useMemo<GeoJSON.Feature>(() => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: path.length > 1 ? path : [] },
  }), [path]);

  if (!ML || !bounds) {
    const target = truck ?? (points[0] ? { lat: points[0].location_lat, lng: points[0].location_lng } : null);
    return (
      <View style={[styles.fallback, height ? { height } : { flex: 1 }]}>
        <View style={styles.fallbackIcon}>
          <MapPin size={22} color={Colors.charcoal} />
        </View>
        <Text style={styles.fallbackTitle}>{!bounds ? 'No locations on this trip yet' : 'Map needs the latest app update'}</Text>
        {target ? (
          <TouchableOpacity style={styles.fallbackBtn} onPress={() => Linking.openURL(mapsLink(target.lat, target.lng)).catch(() => {})}>
            <Text style={styles.fallbackBtnText}>{truck ? 'Open truck in Maps' : 'Open in Maps'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const { Map, Camera, GeoJSONSource, Layer, ViewAnnotation } = ML;
  const routeColor = phase === 'planned' ? '#7651D6' : phase === 'done' ? DONE : ROUTE;

  return (
    <View style={height ? { height } : { flex: 1 }}>
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
      >
        {interactive ? (
          // Frame the trip once and let the operator pan and zoom freely.
          <Camera initialViewState={{ bounds, padding: { top: padding.top, bottom: padding.bottom, left: 40, right: 40 } }} />
        ) : (
          <Camera bounds={bounds} padding={{ top: padding.top, bottom: padding.bottom, left: 40, right: 40 }} duration={0} />
        )}

        <GeoJSONSource id="planned" data={planned}>
          <Layer id="planned-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#FFFFFF', 'line-width': 8 }} />
          <Layer
            id="planned-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': routeColor, 'line-width': 4, 'line-opacity': phase === 'active' ? 0.55 : 0.95, 'line-dasharray': phase === 'done' ? [1, 0] : [2, 1.6] }}
          />
        </GeoJSONSource>

        {path.length > 1 ? (
          <GeoJSONSource id="driven" data={driven}>
            <Layer id="driven-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': phase === 'done' ? DONE : ROUTE, 'line-width': 5 }} />
          </GeoJSONSource>
        ) : null}

        {points.map((s, i) => {
          const done = phase === 'done' || !!s.actual_arrival;
          const isNext = i === nextIdx;
          return (
            <ViewAnnotation key={s.id} id={`stop-${s.id}`} lngLat={[s.location_lng, s.location_lat]} anchor="center">
              <View style={[styles.stop, done ? styles.stopDone : isNext ? styles.stopNext : phase === 'planned' ? styles.stopPlanned : null]}>
                <Text style={[styles.stopText, (done || isNext) && { color: Colors.white }, phase === 'planned' && !done && { color: '#5B34B0' }]}>{i + 1}</Text>
              </View>
            </ViewAnnotation>
          );
        })}

        {truck && phase !== 'done' && phase !== 'cancelled' ? (
          <ViewAnnotation id="truck" lngLat={[truck.lng, truck.lat]} anchor="center">
            <View style={styles.truckHalo}>
              <View style={[styles.truck, !truck.fresh && { backgroundColor: Colors.gray500 }]}>
                <Truck size={15} color={Colors.white} strokeWidth={2.2} />
              </View>
            </View>
          </ViewAnnotation>
        ) : null}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#EFEBE3', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 30 },
  fallbackIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  fallbackTitle: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  fallbackBtn: { backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  fallbackBtnText: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  stop: {
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white, borderWidth: 2.5, borderColor: '#8A8A96',
  },
  stopDone: { backgroundColor: DONE, borderColor: Colors.white },
  stopNext: { backgroundColor: NEXT, borderColor: Colors.white },
  stopPlanned: { borderColor: '#7651D6' },
  stopText: { fontSize: 11, fontWeight: '800', color: Colors.gray700 },
  truckHalo: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(224,80,59,0.18)', alignItems: 'center', justifyContent: 'center' },
  truck: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.charcoal, borderWidth: 2.5, borderColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
});
