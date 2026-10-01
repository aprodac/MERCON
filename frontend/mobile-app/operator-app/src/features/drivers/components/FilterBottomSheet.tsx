/**
 * The Drivers "Sort & filter" sheet. The status filter lives in the tiles at
 * the top of the page, so this holds only what they can't do:
 *   Show only  Documents expiring · No truck assigned
 *   Sort by    Name · Most trips · Highest pay this month · Newest
 * Choices are drafted here and applied with "Apply"; "Reset" clears them.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Check, FileWarning, Truck, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { DriverFlags, DriverSortOption } from '../types';

const INK = '#18181B';
const MUTED = '#6B6B76';

export const SORT_LABEL: Record<DriverSortOption, string> = {
  name: 'Name A-Z',
  trips: 'Most trips',
  pay: 'Highest pay this month',
  newest: 'Newest',
};

export const NO_FLAGS: DriverFlags = { expiring: false, noTruck: false };

interface FilterBottomSheetProps {
  visible: boolean;
  flags: DriverFlags;
  sort: DriverSortOption;
  onApply: (flags: DriverFlags, sort: DriverSortOption) => void;
  onClose: () => void;
}

export function FilterBottomSheet({ visible, flags, sort, onApply, onClose }: FilterBottomSheetProps) {
  const [draftFlags, setDraftFlags] = useState(flags);
  const [draftSort, setDraftSort] = useState(sort);

  // Each time it opens, start from what's applied.
  useEffect(() => {
    if (visible) { setDraftFlags(flags); setDraftSort(sort); }
  }, [visible, flags, sort]);

  const tap = () => Haptics.selectionAsync().catch(() => {});
  const apply = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onApply(draftFlags, draftSort); onClose(); };
  const reset = () => { tap(); setDraftFlags(NO_FLAGS); setDraftSort('name'); };
  const changed = draftFlags.expiring || draftFlags.noTruck || draftSort !== 'name';

  const toggles: { key: keyof DriverFlags; icon: typeof Truck; title: string; sub: string }[] = [
    { key: 'expiring', icon: FileWarning, title: 'Documents expiring', sub: 'Licence or a document expired or due soon' },
    { key: 'noTruck', icon: Truck, title: 'No truck assigned', sub: 'Not on a trip and without a truck' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.grab} />
          <View style={s.head}>
            <Text style={s.title}>Sort & filter</Text>
            <TouchableOpacity onPress={onClose} style={s.close} accessibilityLabel="Close"><X size={16} color={INK} strokeWidth={2.2} /></TouchableOpacity>
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

          <Text style={s.section}>Sort by</Text>
          <View style={s.group}>
            {(Object.keys(SORT_LABEL) as DriverSortOption[]).map((k, i) => {
              const on = draftSort === k;
              return (
                <TouchableOpacity key={k} style={[s.row, i > 0 && s.rowBorder]} onPress={() => { tap(); setDraftSort(k); }} activeOpacity={0.7} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <Text style={[s.rowTitle, { flex: 1 }, on && { fontWeight: '700' }]}>{SORT_LABEL[k]}</Text>
                  {on ? <Check size={18} color={INK} strokeWidth={2.6} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.foot}>
            <TouchableOpacity style={[s.resetBtn, !changed && { opacity: 0.45 }]} onPress={reset} disabled={!changed} activeOpacity={0.8}><Text style={s.resetText}>Reset</Text></TouchableOpacity>
            <TouchableOpacity style={s.applyBtn} onPress={apply} activeOpacity={0.85}><Text style={s.applyText}>Apply</Text></TouchableOpacity>
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
  section: { fontSize: 13, fontWeight: '700', color: MUTED, marginTop: 18, marginBottom: 8, letterSpacing: 0.3, textTransform: 'uppercase' },
  group: { borderRadius: 16, borderWidth: 1, borderColor: '#EDEDF0' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: INK },
  rowSub: { fontSize: 12, color: MUTED, marginTop: 1 },
  foot: { flexDirection: 'row', gap: 10, marginTop: 24 },
  resetBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  resetText: { fontSize: 15, fontWeight: '600', color: INK },
  applyBtn: { flex: 2, height: 48, borderRadius: 14, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
