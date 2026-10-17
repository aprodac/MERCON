/**
 * After changing a trip's date in a month plan / bulk booking: pick which of
 * the other trips made with it move by the same amount — all of them, only
 * the ones from this trip on, or just some (TestFlight feedback: "add an edit
 * previous trip option so it is easier" — fixing a wrong date once, not trip
 * by trip, without dragging along the runs that were right).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Check } from 'lucide-react-native';
import { Colors, Spacing, Radius } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import type { OperatorTrip } from '../../../lib/operator';
import { tap } from '../create/components/ui';

export function MovePlanSheet({ visible, others, editedStart, shiftText, tz, onMove, onOnlyThis }: {
  visible: boolean;
  others: OperatorTrip[];
  /** The edited trip's start before the change — "from this trip on" means at or after it. */
  editedStart: string | null;
  /** "1 day later". */
  shiftText: string;
  tz: string;
  onMove: (ids: string[]) => void;
  onOnlyThis: () => void;
}) {
  const sorted = useMemo(() => [...others].sort((a, b) => Date.parse(a.planned_start ?? '') - Date.parse(b.planned_start ?? '')), [others]);
  const fromHere = useMemo(() => {
    const at = editedStart ? Date.parse(editedStart) : -Infinity;
    return sorted.filter((t) => Date.parse(t.planned_start ?? '') >= at).map((t) => t.id);
  }, [sorted, editedStart]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Each time it opens: everything ticked.
  const [openFor, setOpenFor] = useState<OperatorTrip[] | null>(null);
  if (visible && openFor !== others) {
    setOpenFor(others);
    setPicked(new Set(others.map((t) => t.id)));
  }

  const when = (iso?: string | null) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleString();
    }
  };
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const choices: { label: string; ids: string[] }[] = [
    { label: `All ${sorted.length}`, ids: sorted.map((t) => t.id) },
    ...(fromHere.length && fromHere.length < sorted.length ? [{ label: `From this trip on (${fromHere.length})`, ids: fromHere }] : []),
    { label: 'None', ids: [] },
  ];
  const n = picked.size;

  return (
    <AppModal visible={visible} onClose={onOnlyThis} type="bottom-sheet" title="Move the other trips too?" maxHeight="85%">
      <Text style={s.lead}>{`These were created together with this one (same customer and driver). Tick the ones to move ${shiftText}.`}</Text>
      <View style={s.chips}>
        {choices.map((c) => {
          const on = c.ids.length === n && c.ids.every((id) => picked.has(id));
          return (
            <TouchableOpacity key={c.label} style={[s.chip, on && s.chipOn]} onPress={() => { tap(); setPicked(new Set(c.ids)); }} accessibilityRole="button">
              <Text style={[s.chipText, on && s.chipTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <ScrollView style={{ maxHeight: 340 }}>
        {sorted.map((t, i) => {
          const on = picked.has(t.id);
          return (
            <TouchableOpacity key={t.id} style={[s.row, i > 0 && s.rowBorder]} onPress={() => { tap(); toggle(t.id); }} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <View style={[s.box, on && s.boxOn]}>{on ? <Check size={14} color={Colors.white} strokeWidth={3} /> : null}</View>
              <Text style={s.ref}>{t.ref_id ?? 'Trip'}</Text>
              <Text style={s.when}>{when(t.planned_start)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={s.primary} onPress={() => onMove([...picked])} accessibilityRole="button">
        <Text style={s.primaryText}>{n ? `Move ${n + 1} trips (this + ${n})` : 'Move only this trip'}</Text>
      </TouchableOpacity>
      {n ? (
        <TouchableOpacity style={s.secondary} onPress={onOnlyThis} accessibilityRole="button">
          <Text style={s.secondaryText}>Only this trip</Text>
        </TouchableOpacity>
      ) : null}
    </AppModal>
  );
}

const s = StyleSheet.create({
  lead: { fontSize: 14, lineHeight: 20, color: Colors.gray600 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  chip: { paddingHorizontal: 12, height: 32, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray200, justifyContent: 'center' },
  chipOn: { backgroundColor: Colors.charcoal, borderColor: Colors.charcoal },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  chipTextOn: { color: Colors.white },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.gray100 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.gray300, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  ref: { fontSize: 15, fontWeight: '700', color: Colors.charcoal, width: 92 },
  when: { flex: 1, fontSize: 14, color: Colors.gray600, fontVariant: ['tabular-nums'] },
  primary: { marginTop: Spacing.md, height: 50, borderRadius: Radius.lg, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.white, fontSize: 16, fontWeight: '800' },
  secondary: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: Colors.gray700, fontSize: 15, fontWeight: '600' },
});
