/**
 * The truck's last known position on a small MapLibre map (same tiles as the
 * trip map). Builds without the native map module get a plain card with an
 * "Open in Maps" button instead of crashing.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, TurboModuleRegistry } from 'react-native';
import { MapPin, Truck } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { MAP_STYLE_URL } from '../../trips/details/components/TripMap';

const hasNativeMap = (() => {
  try {
    return !!TurboModuleRegistry.get('MLRNNetworkModule');
  } catch {
    return false;
  }
})();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ML: typeof import('@maplibre/maplibre-react-native') | null = hasNativeMap ? require('@maplibre/maplibre-react-native') : null;

export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export function VehicleLocationMap({ lat, lng, fresh, height = 150 }: { lat: number; lng: number; fresh: boolean; height?: number }) {
  const open = () => Linking.openURL(mapsUrl(lat, lng)).catch(() => {});

  if (!ML) {
    return (
      <View style={[styles.fallback, { height }]}>
        <MapPin size={20} color={Colors.charcoal} />
        <TouchableOpacity style={styles.btn} onPress={open}>
          <Text style={styles.btnText}>Open in Maps</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { Map, Camera, ViewAnnotation } = ML;
  const d = 0.06;
  return (
    <View style={[styles.wrap, { height }]}>
      <Map style={StyleSheet.absoluteFill} mapStyle={MAP_STYLE_URL} logo={false} compass={false} scaleBar={false} dragPan={false} touchZoom={false} doubleTapZoom={false} touchRotate={false} touchPitch={false}>
        <Camera bounds={[lng - d, lat - d, lng + d, lat + d]} duration={0} />
        <ViewAnnotation id="truck" lngLat={[lng, lat]} anchor="center">
          <View style={[styles.halo, !fresh && { backgroundColor: 'rgba(110,110,128,0.2)' }]}>
            <View style={[styles.truck, !fresh && { backgroundColor: Colors.gray500 }]}>
              <Truck size={15} color={Colors.white} strokeWidth={2.2} />
            </View>
          </View>
        </ViewAnnotation>
      </Map>
      <TouchableOpacity style={[styles.btn, styles.btnOver]} onPress={open} activeOpacity={0.8}>
        <Text style={styles.btnText}>Open in Maps</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, overflow: 'hidden' },
  fallback: { borderRadius: 12, backgroundColor: '#EFEBE3', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btn: { backgroundColor: Colors.white, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  btnOver: { position: 'absolute', right: 8, bottom: 8 },
  btnText: { fontSize: 12, fontWeight: '700', color: Colors.charcoal },
  halo: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(224,80,59,0.18)', alignItems: 'center', justifyContent: 'center' },
  truck: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.primary, borderWidth: 2.5, borderColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
});
