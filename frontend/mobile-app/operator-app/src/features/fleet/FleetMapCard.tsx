/**
 * Home's small, non-interactive fleet map: where the trucks on the road are,
 * with one summary line. Tapping anywhere opens the full Fleet map page.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { LiveUnit } from '../../lib/operator';
import { FleetMap } from './FleetMap';
import { isDelayed, isSilent } from './fleetModel';

export function FleetMapCard({ units, onOpen }: { units: LiveUnit[]; onOpen: () => void }) {
  const onRoad = units.filter((u) => u.trip && u.trip.phase !== 'upcoming');
  const now = Date.now();
  const delayed = onRoad.filter(isDelayed).length;
  const silent = onRoad.filter((u) => isSilent(u, now)).length;

  return (
    <TouchableOpacity style={s.card} onPress={onOpen} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Open fleet map">
      <View style={s.map} pointerEvents="none">
        <FleetMap units={onRoad} padding={{ top: 24, bottom: 24 }} />
      </View>
      <View style={s.foot}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Fleet map</Text>
          <Text style={s.sub}>
            {onRoad.length} on the road
            {delayed ? <Text style={{ color: '#D92D20', fontWeight: '600' }}>{` · ${delayed} delayed`}</Text> : null}
            {silent ? ` · ${silent} no GPS` : ''}
          </Text>
        </View>
        <ChevronRight size={18} color="#A1A1AA" />
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', overflow: 'hidden' },
  map: { height: 160, backgroundColor: '#EFEFF1' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#E9E9EC' },
  title: { fontSize: 15, fontWeight: '600', color: '#18181B' },
  sub: { fontSize: 13, color: '#6B6B76', marginTop: 1 },
});
