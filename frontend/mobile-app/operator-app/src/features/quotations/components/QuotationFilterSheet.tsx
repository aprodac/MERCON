/**
 * The Filters sheet on the quotations page: sort order, then needs attention
 * (expiring, no driver pay, unused), billing (Monthly / Extra), line type,
 * truck type, rate basis and who created it. Several values can
 * be picked per field; nothing picked = no filter on it. Choices are made on a
 * draft and applied with "Show N quotations", which counts live as you pick.
 */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { QuotationFilters, QuotationSortOption } from '../types';
import { EMPTY_QUOTATION_FILTERS } from '../types';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  Icon?: LucideIcon;
}

export const SORT_OPTIONS: { value: QuotationSortOption; label: string }[] = [
  { value: 'route', label: 'Route A–Z' },
  { value: 'rate', label: 'Rate: high to low' },
  { value: 'rate_low', label: 'Rate: low to high' },
  { value: 'used', label: 'Most used' },
  { value: 'newest', label: 'Newest' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  filters: QuotationFilters;
  sort: QuotationSortOption;
  onApply: (filters: QuotationFilters, sort: QuotationSortOption) => void;
  options: Record<keyof QuotationFilters, FilterOption[]>;
  /** How many quotations a set of filters would show. */
  countFor: (filters: QuotationFilters) => number;
}

export function QuotationFilterSheet({ visible, onClose, filters, sort, onApply, options, countFor }: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(filters);
  const [draftSort, setDraftSort] = useState(sort);
  // Opening the sheet starts from what is applied now.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) { setDraft(filters); setDraftSort(sort); }
  }

  const toggle = (field: keyof QuotationFilters, value: string) => {
    Haptics.selectionAsync().catch(() => {});
    setDraft((d) => ({ ...d, [field]: d[field].includes(value) ? d[field].filter((v) => v !== value) : [...d[field], value] }));
  };
  const count = countFor(draft);

  const group = (title: string, field: keyof QuotationFilters, list: FilterOption[]) => (list.length > (field === 'attention' ? 0 : 1) || draft[field].length > 0 ? (
    <View style={s.group}>
      <Text style={s.groupTitle}>{title}</Text>
      <View style={s.wrap}>
        {list.map((o) => {
          const on = draft[field].includes(o.value);
          return (
            <TouchableOpacity key={o.value} style={[s.chip, on && s.chipOn]} activeOpacity={0.8} onPress={() => toggle(field, o.value)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              {o.Icon ? <o.Icon size={14} color={on ? Colors.white : MUTED} strokeWidth={2.3} /> : null}
              <Text style={[s.chipText, on && { color: Colors.white }]}>{o.label}</Text>
              {o.count != null ? <Text style={[s.chipCount, on && { color: 'rgba(255,255,255,0.7)' }]}>{o.count}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  ) : null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close filters" />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={s.handle} />
        <View style={s.head}>
          <Text style={s.title}>Filter & sort</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <X size={20} color={INK} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          <View style={s.group}>
            <Text style={s.groupTitle}>Sort by</Text>
            <View style={s.wrap}>
              {SORT_OPTIONS.map((o) => {
                const on = draftSort === o.value;
                return (
                  <TouchableOpacity key={o.value} style={[s.chip, on && s.chipOn]} activeOpacity={0.8} onPress={() => setDraftSort(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                    {on ? <Check size={14} color={Colors.white} strokeWidth={2.6} /> : null}
                    <Text style={[s.chipText, on && { color: Colors.white }]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {group('Needs attention', 'attention', options.attention)}
          {group('Operation', 'operation', options.operation)}
          {group('Line type', 'lineType', options.lineType)}
          {group('Truck type', 'truck', options.truck)}
          {group('Rate basis', 'basis', options.basis)}
          {group('Created by', 'creator', options.creator)}
        </ScrollView>
        <View style={s.actions}>
          <TouchableOpacity style={s.reset} onPress={() => { setDraft(EMPTY_QUOTATION_FILTERS); setDraftSort('route'); }} accessibilityRole="button">
            <Text style={s.resetText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.apply} onPress={() => { onApply(draft, draftSort); onClose(); }} accessibilityRole="button">
            <Text style={s.applyText}>Show {count} {count === 1 ? 'quotation' : 'quotations'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { maxHeight: '82%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 8, gap: 12 },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#DCDCE0' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  title: { fontSize: 18, fontWeight: '800', color: INK },
  group: { gap: 8 },
  groupTitle: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E4E8' },
  chipOn: { backgroundColor: Colors.charcoal, borderColor: Colors.charcoal },
  chipText: { fontSize: 13, fontWeight: '600', color: INK },
  chipCount: { fontSize: 12, fontWeight: '700', color: '#9898A4', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  reset: { height: 48, paddingHorizontal: 20, borderRadius: 14, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  resetText: { fontSize: 15, fontWeight: '700', color: INK },
  apply: { flex: 1, height: 48, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
