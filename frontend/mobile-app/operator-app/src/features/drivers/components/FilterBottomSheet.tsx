/**
 * The Drivers filter sheet. Two things an operator actually filters by:
 *   Status     All · Available · On trip · Offline
 *   Show only  Documents expiring · No truck assigned
 * Choices are drafted in the sheet and applied with "Show drivers";
 * "Reset" clears everything. Sorting stays in the list's sort menu.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { FileWarning, Truck, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { DriverFlags, DriverStatus } from '../types';

const INK = '#18181B';
const MUTED = '#6B6B76';

export const STATUS_OPTIONS: { value: DriverStatus | null; label: string; dot?: string }[] = [
  { value: null, label: 'All' },
  { value: 'Available', label: 'Available', dot: '#16A34A' },
  { value: 'OnTrip', label: 'On trip', dot: '#EAB308' },
  { value: 'OffDuty', label: 'Offline', dot: '#DC2626' },
];

export const NO_FLAGS: DriverFlags = { expiring: false, noTruck: false };

interface FilterBottomSheetProps {
  visible: boolean;
  status: DriverStatus | null;
  flags: DriverFlags;
  onApply: (status: DriverStatus | null, flags: DriverFlags) => void;
  onClose: () => void;
}

export function FilterBottomSheet({ visible, status, flags, onApply, onClose }: FilterBottomSheetProps) {
  const [draftStatus, setDraftStatus] = useState(status);
  const [draftFlags, setDraftFlags] = useState(flags);

  // Each time it opens, start from what's applied.
  useEffect(() => {
    if (visible) { setDraftStatus(status); setDraftFlags(flags); }
  }, [visible, status, flags]);

  const tap = () => Haptics.selectionAsync().catch(() => {});
  const apply = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onApply(draftStatus, draftFlags); onClose(); };
  const reset = () => { tap(); setDraftStatus(null); setDraftFlags(NO_FLAGS); };

  const toggles: { key: keyof DriverFlags; icon: typeof Truck; title: string; sub: string }[] = [
    { key: 'expiring', icon: FileWarning, title: 'Documents expiring', sub: 'Licence or a document expired or expiring soon' },
    { key: 'noTruck', icon: Truck, title: 'No truck assigned', sub: 'Drivers without a truck, off trip' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.grab} />
          <View style={s.head}>
            <Text style={s.title}>Filter drivers</Text>
            <TouchableOpacity onPress={onClose} style={s.close} accessibilityLabel="Close"><X size={16} color={INK} strokeWidth={2.2} /></TouchableOpacity>
          </View>

          <Text style={s.section}>Status</Text>
          <View style={s.chips}>
            {STATUS_OPTIONS.map((o) => {
              const on = draftStatus === o.value;
              return (
                <TouchableOpacity key={o.label} style={[s.chip, on && s.chipOn]} onPress={() => { tap(); setDraftStatus(o.value); }} activeOpacity={0.8}>
                  {o.dot ? <View style={[s.dot, { backgroundColor: o.dot }]} /> : null}
                  <Text style={[s.chipText, on && { color: '#FFFFFF' }]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.section}>Show only</Text>
          <View style={s.group}>
            {toggles.map((t, i) => (
              <View key={t.key} style={[s.row, i > 0 && s.rowBorder]}>
                <View style={s.rowIcon}><t.icon size={17} color={INK} strokeWidth={2.1} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{t.title}</Text>
                  <Text style={s.rowSub}>{t.sub}</Text>
                </View>
                <Switch
                  value={draftFlags[t.key]}
                  onValueChange={(v) => { tap(); setDraftFlags((f) => ({ ...f, [t.key]: v })); }}
                  trackColor={{ true: INK, false: '#E4E4E7' }}
                />
              </View>
            ))}
          </View>

          <View style={s.foot}>
            <TouchableOpacity style={s.resetBtn} onPress={reset} activeOpacity={0.8}><Text style={s.resetText}>Reset</Text></TouchableOpacity>
            <TouchableOpacity style={s.applyBtn} onPress={apply} activeOpacity={0.85}><Text style={s.applyText}>Show drivers</Text></TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 34, paddingTop: 10 },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#E4E4E7', marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 19, fontWeight: '700', color: INK },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 13, fontWeight: '600', color: MUTED, marginTop: 16, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: '#F4F4F5' },
  chipOn: { backgroundColor: INK },
  chipText: { fontSize: 14, fontWeight: '600', color: '#3F3F46' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  group: { borderRadius: 16, borderWidth: 1, borderColor: '#EDEDF0' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: INK },
  rowSub: { fontSize: 12, color: MUTED, marginTop: 1 },
  foot: { flexDirection: 'row', gap: 10, marginTop: 22 },
  resetBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  resetText: { fontSize: 15, fontWeight: '600', color: INK },
  applyBtn: { flex: 2, height: 48, borderRadius: 14, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
