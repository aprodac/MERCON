/**
 * Home's fleet map: where the trucks on the road are, with a small legend on
 * the map (on the road · delayed · no GPS). Non-interactive; tapping anywhere
 * opens the full Fleet map page.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Maximize2 } from 'lucide-react-native';
import type { LiveUnit } from '../../lib/operator';
import { FleetMap } from './FleetMap';
import { isDelayed, isSilent } from './fleetModel';

export function FleetMapCard({ units, now, onOpen }: { units: LiveUnit[]; now: number; onOpen: () => void }) {
  const onRoad = units.filter((u) => u.trip && u.trip.phase !== 'upcoming');
  const delayed = onRoad.filter(isDelayed).length;
  const silent = onRoad.filter((u) => isSilent(u, now)).length;
  const legend = [
    { key: 'road', label: `${onRoad.length} on the road`, color: '#3E3C3D', show: true },
    { key: 'late', label: `${delayed} delayed`, color: '#D92D20', show: delayed > 0 },
    { key: 'gps', label: `${silent} no GPS`, color: '#B54708', show: silent > 0 },
  ].filter((l) => l.show);

  return (
    <TouchableOpacity
      style={s.card}
      onPress={onOpen}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`Open fleet map. ${legend.map((l) => l.label).join(', ')}`}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <FleetMap units={onRoad} padding={{ top: 56, bottom: 64 }} />
      </View>
      <View style={s.top} pointerEvents="none">
        <View style={s.pill}><Text style={s.title}>Fleet map</Text></View>
        <View style={s.expand}><Maximize2 size={15} color="#3E3C3D" strokeWidth={2.2} /></View>
      </View>
      <View style={s.legend} pointerEvents="none">
        {legend.map((l) => (
          <View key={l.key} style={s.pill}>
            <View style={[s.dot, { backgroundColor: l.color }]} />
            <Text style={[s.pillText, l.key !== 'road' && { color: l.color }]}>{l.label}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { height: 240, borderRadius: 20, overflow: 'hidden', backgroundColor: '#EFEFF1', borderWidth: 1, borderColor: '#E9E9EC', justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.94)', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  title: { fontSize: 13, fontWeight: '700', color: '#3E3C3D' },
  expand: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: '600', color: '#3E3C3D' },
});
