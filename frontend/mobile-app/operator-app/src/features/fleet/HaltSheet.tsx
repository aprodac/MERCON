/**
 * A break marker tapped on the map: where the truck stood still and for how
 * long. The name is the API's (road and nearest town, from OpenStreetMap —
 * services/geo/placeNames.ts); it rarely names the petrol station or hotel
 * itself, so "Open in Google Maps" drops a pin on the exact spot, where
 * Google shows what's there.
 */
import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MapPin, Navigation } from 'lucide-react-native';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import type { TripHalt } from '../../lib/operator';
import type { makeTime } from '../trips/list/tripListModel';
import { mapsUrl } from '../vehicles/details/VehicleLocationMap';
import { formatDuration } from './fleetModel';

type Time = ReturnType<typeof makeTime>;

export function HaltSheet({ halt, f, onClose }: { halt: TripHalt | null; f: Time; onClose: () => void }) {
  const h = halt;
  return (
    <AppModal visible={!!h} onClose={onClose} type="bottom-sheet" title={h?.ongoing ? 'Stopped here' : 'Break on the way'}>
      {h ? (
        <View style={s.body}>
          <View style={s.placeRow}>
            <MapPin size={18} color="#3F3F46" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.place}>{h.place || 'Place name not known yet'}</Text>
              <Text style={s.coords} selectable>{h.lat.toFixed(5)}, {h.lng.toFixed(5)}</Text>
            </View>
          </View>

          <View style={s.times}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{h.ongoing ? 'Since' : 'From – to'}</Text>
              <Text style={s.value}>{f.time(h.from)}{h.ongoing ? '' : ` – ${f.time(h.to)}`}</Text>
              <Text style={s.sub}>{f.day(h.from)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Stood still</Text>
              <Text style={[s.value, h.ongoing && { color: '#D97706' }]}>{formatDuration(h.minutes * 60)}{h.ongoing ? ' so far' : ''}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={s.open}
            onPress={() => Linking.openURL(mapsUrl(h.lat, h.lng)).catch(() => {})}
            activeOpacity={0.85}
            accessibilityLabel="Open this spot in Google Maps"
          >
            <Navigation size={16} color="#FFFFFF" />
            <Text style={s.openText}>Open in Google Maps</Text>
          </TouchableOpacity>
          <Text style={s.hint}>Google Maps shows the petrol station, hotel or shop at this spot.</Text>
        </View>
      ) : null}
    </AppModal>
  );
}

const s = StyleSheet.create({
  body: { gap: 16, paddingBottom: 8 },
  placeRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  place: { fontSize: 16, fontWeight: '700', color: '#18181B' },
  coords: { fontSize: 12, color: '#71717A', marginTop: 2, fontVariant: ['tabular-nums'] },
  times: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 14, backgroundColor: '#F4F4F5' },
  label: { fontSize: 12, color: '#71717A' },
  value: { fontSize: 16, fontWeight: '700', color: '#18181B', marginTop: 2, fontVariant: ['tabular-nums'] },
  sub: { fontSize: 12, color: '#71717A', marginTop: 1 },
  open: { height: 50, borderRadius: 14, backgroundColor: '#18181B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  openText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  hint: { fontSize: 12, color: '#71717A', textAlign: 'center', marginTop: -8 },
});
