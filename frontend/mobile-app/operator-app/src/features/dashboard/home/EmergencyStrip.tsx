/**
 * Shown on Home only while a driver emergency is open (not yet marked
 * Handled). One emergency: what happened, Call and Handled right here.
 * Several: a count that opens Notifications → To do.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight, Phone, Siren } from 'lucide-react-native';
import type { ActionIntent, ActionItem } from '../actions/actionModel';
import { whenLabel } from '../actions/actionModel';
import { tap } from '../../notifications/components/parts';

const RED = '#D92D20';

export function EmergencyStrip({ items, now, onIntent, onOpenTrip, onAll }: {
  items: ActionItem[];
  now: number;
  onIntent: (intent: ActionIntent) => void;
  onOpenTrip: (tripId: string) => void;
  onAll: () => void;
}) {
  if (items.length === 0) return null;

  if (items.length > 1) {
    return (
      <TouchableOpacity style={[s.strip, s.row]} onPress={() => { tap(); onAll(); }} activeOpacity={0.8} accessibilityRole="button">
        <View style={s.icon}><Siren size={18} color="#FFFFFF" strokeWidth={2.4} /></View>
        <Text style={[s.title, { flex: 1 }]}>{items.length} open emergencies</Text>
        <ChevronRight size={18} color="#FFFFFF" />
      </TouchableOpacity>
    );
  }

  const e = items[0];
  const when = whenLabel(e, now);
  const call = e.primary.intent.type === 'call' ? e.primary : null;
  const handled = [e.primary, e.secondary].find((b) => b?.intent.type === 'handled');

  return (
    <TouchableOpacity
      style={s.strip}
      onPress={() => { tap(); if (e.tripId) onOpenTrip(e.tripId); }}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Emergency. ${e.title}. ${e.detail}`}
    >
      <View style={s.row}>
        <View style={s.icon}><Siren size={18} color="#FFFFFF" strokeWidth={2.4} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{e.title}</Text>
          {when ? <Text style={s.when}>{when.text}</Text> : null}
        </View>
      </View>
      {e.detail ? <Text style={s.detail} numberOfLines={2}>{e.detail}</Text> : null}
      <View style={s.actions}>
        {handled ? (
          <TouchableOpacity style={s.ghost} onPress={() => { tap(); onIntent(handled.intent); }} hitSlop={6}>
            <Text style={s.ghostText}>Handled</Text>
          </TouchableOpacity>
        ) : null}
        {call ? (
          <TouchableOpacity style={s.call} onPress={() => { tap(); onIntent(call.intent); }} hitSlop={6} accessibilityLabel="Call driver">
            <Phone size={15} color={RED} strokeWidth={2.4} />
            <Text style={s.callText}>Call driver</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  strip: { backgroundColor: RED, borderRadius: 16, padding: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  when: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  detail: { fontSize: 13, color: 'rgba(255,255,255,0.92)', lineHeight: 18 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 2 },
  ghost: { height: 34, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  ghostText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  call: { height: 34, paddingHorizontal: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF' },
  callText: { fontSize: 13, fontWeight: '700', color: RED },
});
