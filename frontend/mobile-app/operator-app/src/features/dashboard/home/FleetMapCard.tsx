/**
 * "Fleet map" as one slim row under Live trips (owner, 23 Oct: the Live trip
 * cards already carry their own maps, so a second map here repeated them):
 * how many trucks are on the map and on the road; tapping opens the Fleet map.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight, Map as MapIcon } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { isOnRoad, type LiveUnit } from '../../../lib/operator';
import { located } from '../../fleet/fleetModel';
import { INK, LINE, MUTED, tap } from '../../notifications/components/parts';

export function FleetMapCard({ units, onOpenMap }: { units: LiveUnit[]; onOpenMap: () => void }) {
  const onMap = units.filter(located).length;
  const onRoad = units.filter(isOnRoad).length;
  return (
    <TouchableOpacity style={s.row} onPress={() => { tap(); onOpenMap(); }} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Open fleet map">
      <View style={s.icon}><MapIcon size={18} color={INK} strokeWidth={2.1} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title}>Fleet map</Text>
        <Text style={s.sub} numberOfLines={1}>
          {onMap ? `${onMap} truck${onMap === 1 ? '' : 's'} on the map` : 'No truck has a GPS fix yet'}
          {onRoad ? ` · ${onRoad} on the road` : ''}
        </Text>
      </View>
      <ChevronRight size={18} color={MUTED} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 18, borderWidth: 1, borderColor: LINE, paddingHorizontal: 14, paddingVertical: 12 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F1F3' },
  title: { fontSize: 15, fontWeight: '700', color: INK },
  sub: { fontSize: 12, color: MUTED, marginTop: 1 },
});
