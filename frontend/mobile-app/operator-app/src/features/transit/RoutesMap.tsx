/**
 * Every route of the Transit times page on one map: the routes as thin lines,
 * the picked one bold with its start (A) and end (B), the camera framing the
 * picked route — or all of them when none is picked. Lines join the stops
 * place to place (the road taken is in the trips themselves).
 *
 * MapLibre is native code; a build without it shows a plain note instead.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { ML } from '../../lib/maplibre';
import { MAP_STYLE_URL } from '../trips/details/components/TripMap';
import { niceName } from '../trips/create/components/ui';
import { boundsOf, type OverviewRoute } from './transitModel';

const PICKED = '#1F4FD1';
const OTHER = '#7A7F8C';

export function RoutesMap({ routes, picked, height = 250 }: { routes: OverviewRoute[]; picked: OverviewRoute | null; height?: number }) {
  const located = useMemo(() => routes.filter((r) => r.points.length >= 2), [routes]);
  const bounds = useMemo(() => boundsOf(picked && picked.points.length >= 2 ? picked.points : located.flatMap((r) => r.points)), [picked, located]);
  const others = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: located.filter((r) => r.uid !== picked?.uid).map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.points } })),
  }), [located, picked]);
  const line = useMemo<GeoJSON.Feature | null>(() => (picked && picked.points.length >= 2
    ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: picked.points } }
    : null), [picked]);

  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 8000);
    return () => clearTimeout(t);
  }, []);

  if (!ML || !bounds) {
    return (
      <View style={[s.note, { height: Math.min(height, 120) }]}>
        <MapPin size={20} color={Colors.gray500} />
        <Text style={s.noteText}>{!bounds ? 'No route has its places on the map yet' : 'The map needs the latest app update'}</Text>
      </View>
    );
  }
  const { Map, Camera, GeoJSONSource, Layer, ViewAnnotation } = ML;
  const start = picked?.points[0];
  const end = picked?.points[picked.points.length - 1];

  return (
    <View style={[s.wrap, { height }]}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE_URL}
        logo={false}
        compass={false}
        scaleBar={false}
        attributionPosition={{ bottom: 6, right: 8 }}
        touchRotate={false}
        touchPitch={false}
        onDidFinishRenderingMapFully={() => setReady(true)}
        onDidFailLoadingMap={() => setReady(true)}
      >
        <Camera bounds={bounds} padding={{ top: 36, bottom: 30, left: 36, right: 36 }} duration={600} />
        {others.features.length ? (
          <GeoJSONSource id="others" data={others}>
            <Layer id="others-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': OTHER, 'line-width': 2.5, 'line-opacity': picked ? 0.35 : 0.8 }} />
          </GeoJSONSource>
        ) : null}
        {line ? (
          <GeoJSONSource id="picked" data={line}>
            <Layer id="picked-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#FFFFFF', 'line-width': 9 }} />
            <Layer id="picked-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': PICKED, 'line-width': 5 }} />
          </GeoJSONSource>
        ) : null}
        {start && end && picked ? (
          <>
            <ViewAnnotation id="start" lngLat={start} anchor="center">
              <View style={[s.pin, { backgroundColor: '#12B76A' }]}><Text style={s.pinText}>A</Text></View>
            </ViewAnnotation>
            <ViewAnnotation id="end" lngLat={end} anchor="center">
              <View style={[s.pin, { backgroundColor: '#E0503B' }]}><Text style={s.pinText}>B</Text></View>
            </ViewAnnotation>
          </>
        ) : null}
      </Map>
      {picked ? (
        <View style={s.caption} pointerEvents="none">
          <Text style={s.captionText} numberOfLines={1}>{`A ${niceName(picked.from)}  →  B ${niceName(picked.to)}`}</Text>
        </View>
      ) : null}
      {!ready ? (
        <View style={s.loading} pointerEvents="none">
          <ActivityIndicator color={Colors.gray500} />
          <Text style={s.noteText}>Loading map…</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#EFEBE3' },
  note: { borderRadius: 18, backgroundColor: '#EFEBE3', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  noteText: { fontSize: 13, fontWeight: '600', color: Colors.gray700, textAlign: 'center' },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#EFEBE3', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pin: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#FFFFFF' },
  pinText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  caption: { position: 'absolute', top: 10, left: 10, right: 10, alignItems: 'flex-start' },
  captionText: { backgroundColor: 'rgba(17,17,17,0.72)', color: '#FFFFFF', fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
});
