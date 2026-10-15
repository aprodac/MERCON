/**
 * Offered after stops were added to an existing trip. Everything is optional and
 * skipped by default: an extra-stop charge for the customer (a trip charge line,
 * pre-filled from their "additional stop" rule) and/or a raise of the driver
 * payout. The quotation and the trip price never change.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { Colors, Spacing, Radius } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { Label, TextField, tap } from '../create/components/ui';

export interface ExtraStopSheetValue {
  addCharge: boolean;
  rate: number;
  payoutIncrease: number;
}

export function ExtraStopSheet({
  visible, added, defaultRate, chargeType, hasDriver, saving, onSkip, onSave,
}: {
  visible: boolean;
  added: number;
  defaultRate: number | null;
  chargeType: string;
  hasDriver: boolean;
  saving?: boolean;
  onSkip: () => void;
  onSave: (v: ExtraStopSheetValue) => void;
}) {
  const [addCharge, setAddCharge] = useState(false);
  const [rate, setRate] = useState('');
  const [payout, setPayout] = useState('');

  useEffect(() => {
    if (!visible) return;
    setAddCharge(false);
    setRate(defaultRate != null ? String(defaultRate) : '');
    setPayout('');
  }, [visible, defaultRate]);

  const rateNum = Number(rate);
  const payoutNum = Number(payout);
  const chargeOk = addCharge && rateNum > 0;
  const payoutOk = payoutNum > 0;

  return (
    <AppModal visible={visible} onClose={onSkip} type="bottom-sheet" title="Extra stop added">
      <Text style={styles.lead}>
        {added} stop{added > 1 ? 's' : ''} added. The quotation and the trip price stay as they are. Add an extra stop charge? (optional)
      </Text>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Add extra stop charge</Text>
          <Text style={styles.toggleHint}>{chargeType} × {added}, billed to the customer</Text>
        </View>
        <Switch value={addCharge} onValueChange={setAddCharge} trackColor={{ true: Colors.primary, false: Colors.gray200 }} thumbColor={Colors.white} />
      </View>
      {addCharge ? (
        <>
          <Label>Charge per stop</Label>
          <TextField value={rate} onChangeText={(v) => setRate(v.replace(/[^0-9.]/g, ''))} prefix="SAR" placeholder="0" keyboardType="decimal-pad" />
        </>
      ) : null}

      {hasDriver ? (
        <>
          <Label>Raise driver payout by (optional)</Label>
          <TextField value={payout} onChangeText={(v) => setPayout(v.replace(/[^0-9.]/g, ''))} prefix="SAR" placeholder="0" keyboardType="decimal-pad" />
        </>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onSkip} activeOpacity={0.8} disabled={saving}>
          <Text style={styles.btnGhostText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, !(chargeOk || payoutOk) && { opacity: 0.4 }]}
          disabled={saving || !(chargeOk || payoutOk)}
          onPress={() => { tap(); onSave({ addCharge: chargeOk, rate: rateNum, payoutIncrease: payoutOk ? payoutNum : 0 }); }}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 13, color: Colors.charcoal, lineHeight: 18, marginBottom: Spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  toggleTitle: { fontSize: 14, fontWeight: '600', color: Colors.charcoal },
  toggleHint: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  btn: { flex: 1, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.white },
  btnGhostText: { fontSize: 15, fontWeight: '600', color: Colors.charcoal },
  btnPrimary: { backgroundColor: Colors.primary },
  btnPrimaryText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
