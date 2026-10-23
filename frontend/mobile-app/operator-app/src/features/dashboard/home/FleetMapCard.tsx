/**
 * "Fleet map": every truck with a position on one small map (shows even when
 * nothing is on the road). Tapping it opens the full Fleet map. The trips on
 * the road themselves are the Live trips cards above it.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight, Maximize2 } from 'lucide-react-native';
import type { LiveUnit } from '../../../lib/operator';
import { FleetMap } from '../../fleet/FleetMap';
import { INK, LINE, MUTED, tap } from '../../notifications/components/parts';

export function FleetMapCard({ units, onOpenMap }: { units: LiveUnit[]; onOpenMap: () => void }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={s.head}>
        <Text style={s.h2}>Fleet map</Text>
        <TouchableOpacity onPress={() => { tap(); onOpenMap(); }} hitSlop={8} style={s.link}>
          <Text style={s.linkText}>Open</Text>
          <ChevronRight size={15} color={MUTED} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.card} onPress={() => { tap(); onOpenMap(); }} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Open fleet map">
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <FleetMap units={units} padding={{ top: 24, bottom: 24 }} />
        </View>
        <View style={s.expand} pointerEvents="none"><Maximize2 size={15} color={INK} strokeWidth={2.2} /></View>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  h2: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 14, fontWeight: '500', color: MUTED },

  card: { height: 190, backgroundColor: '#EFEFF1', borderRadius: 22, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  expand: {
    position: 'absolute', right: 10, bottom: 10, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
});
