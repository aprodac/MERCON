/** Small building blocks shared by the trip details tabs and sheets. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { TONE, type Tone } from '../tripDetailsModel';

export const INK = '#2B2A2B';
export const MUTED = '#5F5F6E';
export const PAGE = '#EEF1F6';
export const WA = '#1A9E55';
export const WA_LIGHT = '#E3F7EA';
export const WA_INK = '#0F6B37';
export const ACTION = '#C4432F';

export function tap() {
  Haptics.selectionAsync().catch(() => {});
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[p.card, style]}>{children}</View>;
}

export function Chip({ label, tone, dot, solid, style }: { label: string; tone: Tone; dot?: boolean; solid?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = TONE[tone];
  return (
    <View style={[p.chip, { backgroundColor: solid ? t.dot : t.bg }, style]}>
      {dot ? <View style={[p.chipDot, { backgroundColor: t.dot }]} /> : null}
      <Text style={[p.chipText, { color: solid ? Colors.white : t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={p.sectionHead}>
      <Text style={p.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Text style={[p.muted, style]}>{children}</Text>;
}

/** A light-grey tile: caption above, value below. */
export function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={p.fact}>
      <Text style={p.factLabel}>{label}</Text>
      <Text style={[p.factValue, mono && p.mono]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function SoftButton({
  label, icon: Icon, onPress, bg = '#F1F3F7', fg = INK, style, loading, disabled,
}: { label: string; icon?: LucideIcon; onPress: () => void; bg?: string; fg?: string; style?: StyleProp<ViewStyle>; loading?: boolean; disabled?: boolean }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} disabled={disabled || loading} style={[p.softBtn, { backgroundColor: bg }, (disabled && !loading) && { opacity: 0.5 }, style]}>
      {loading ? <ActivityIndicator size="small" color={fg} /> : Icon ? <Icon size={16} color={fg} strokeWidth={2.2} /> : null}
      <Text style={[p.softBtnText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A tappable row in an action sheet: tinted icon, label, short explanation. */
export function SheetRow({
  icon: Icon, tint, fg, label, sub, onPress, danger, disabled,
}: { icon: LucideIcon; tint: string; fg: string; label: string; sub?: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} disabled={disabled} style={[p.row, disabled && { opacity: 0.45 }]}>
      <View style={[p.rowIcon, { backgroundColor: tint }]}>
        <Icon size={18} color={fg} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[p.rowLabel, danger && { color: '#B42318' }]}>{label}</Text>
        {sub ? <Text style={p.rowSub}>{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[p.divider, style]} />;
}

export const p = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: 18, padding: 14, shadowColor: '#14141E', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: '700' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: INK },
  muted: { fontSize: 12, color: MUTED },
  fact: { flex: 1, backgroundColor: '#F5F6F9', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9 },
  factLabel: { fontSize: 11, color: MUTED, fontWeight: '500' },
  factValue: { fontSize: 13, fontWeight: '700', color: INK, marginTop: 1 },
  mono: { fontFamily: 'monospace', fontWeight: '600' },
  softBtn: { height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  softBtnText: { fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '700', color: INK },
  rowSub: { fontSize: 12, color: MUTED, marginTop: 1 },
  divider: { height: 1, backgroundColor: '#EEF0F4' },
});
