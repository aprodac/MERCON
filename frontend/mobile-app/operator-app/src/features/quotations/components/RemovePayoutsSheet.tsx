/**
 * "Remove driver payouts" (Quotations → ⋯): clears the driver payout on every
 * quotation of the picked customers, or all of them. Trips that were paid the
 * quotation's payout keep that pay (the server writes it onto the trip first),
 * so only trips created afterwards start without a default payout. Asks once
 * more with the server's own counts before changing anything.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { quotationsApi } from '../api/quotationsApi';
import type { QuotationListItem } from '../types';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

interface Props {
  visible: boolean;
  onClose: () => void;
  quotations: QuotationListItem[];
  /** The company open on the page, picked to start with. */
  customerId?: string | null;
  onDone: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function RemovePayoutsSheet({ visible, onClose, quotations, customerId, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [all, setAll] = useState(!customerId);
  const [picked, setPicked] = useState<string[]>(customerId ? [customerId] : []);
  const [busy, setBusy] = useState(false);
  // Opening the sheet starts from the company open on the page.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) { setAll(!customerId); setPicked(customerId ? [customerId] : []); }
  }

  /** Customers with at least one quotation that has a driver payout. */
  const customers = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; count: number }>();
    for (const q of quotations) {
      if (!q.driverPayout || q.driverPayout <= 0) continue;
      const c = byId.get(q.customerId) ?? { id: q.customerId, name: q.customerName, count: 0 };
      c.count += 1;
      byId.set(q.customerId, c);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [quotations]);

  const chosen = all ? customers : customers.filter((c) => picked.includes(c.id));
  const count = chosen.reduce((n, c) => n + c.count, 0);

  const toggle = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setAll(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const run = async () => {
    const ids = all ? null : picked;
    setBusy(true);
    try {
      const preview = await quotationsApi.clearDriverPayouts(ids, true);
      setBusy(false);
      if (preview.quotations === 0) {
        Alert.alert('Nothing to remove', 'None of these quotations has a driver payout.');
        return;
      }
      const who = all ? 'every customer' : plural(picked.length, 'customer');
      const kept = preview.trips_kept > 0 ? `\n\n${plural(preview.trips_kept, 'past trip')} paid from these quotations keep their driver pay.` : '';
      Alert.alert(
        'Remove driver payouts?',
        `The driver payout comes off ${plural(preview.quotations, 'quotation')} of ${who}. New trips on these lanes will start with no driver pay.${kept}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setBusy(true);
              try {
                const done = await quotationsApi.clearDriverPayouts(ids, false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                onClose();
                onDone();
                Alert.alert('Driver payouts removed', `${plural(done.quotations, 'quotation')} changed.`);
              } catch (e: any) {
                Alert.alert("Couldn't remove driver payouts", e?.response?.data?.error?.message || e?.message || 'Try again.');
              } finally {
                setBusy(false);
              }
            },
          },
        ],
      );
    } catch (e: any) {
      setBusy(false);
      Alert.alert("Couldn't check the quotations", e?.response?.data?.error?.message || e?.message || 'Try again.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={s.handle} />
        <View style={s.head}>
          <Text style={s.title}>Remove driver payouts</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <X size={20} color={INK} />
          </TouchableOpacity>
        </View>
        <Text style={s.note}>Clears the driver payout on the quotations of the customers you pick. Trips already paid from them keep their pay.</Text>
        <ScrollView contentContainerStyle={{ gap: 6, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          <Row label="All customers" sub={plural(customers.reduce((n, c) => n + c.count, 0), 'quotation')} on={all} onPress={() => { Haptics.selectionAsync().catch(() => {}); setAll((a) => !a); setPicked([]); }} />
          {customers.map((c) => (
            <Row key={c.id} label={c.name} sub={plural(c.count, 'quotation')} on={all || picked.includes(c.id)} onPress={() => toggle(c.id)} />
          ))}
          {customers.length === 0 ? <Text style={s.note}>No quotation has a driver payout.</Text> : null}
        </ScrollView>
        <TouchableOpacity style={[s.apply, (count === 0 || busy) && { opacity: 0.5 }]} disabled={count === 0 || busy} onPress={run} accessibilityRole="button">
          {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={s.applyText}>Remove from {plural(count, 'quotation')}</Text>}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function Row({ label, sub, on, onPress }: { label: string; sub: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <View style={[s.box, on && s.boxOn]}>{on ? <Check size={14} color={Colors.white} strokeWidth={2.8} /> : null}</View>
      <Text style={s.rowLabel} numberOfLines={1}>{label}</Text>
      <Text style={s.rowSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { maxHeight: '82%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 8, gap: 12 },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#DCDCE0' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  title: { fontSize: 18, fontWeight: '800', color: INK },
  note: { fontSize: 13, color: MUTED, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#F7F7F8' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#C9C9D0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  boxOn: { backgroundColor: Colors.charcoal, borderColor: Colors.charcoal },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
  rowSub: { fontSize: 12.5, fontWeight: '600', color: MUTED, fontVariant: ['tabular-nums'] },
  apply: { height: 48, borderRadius: 14, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
