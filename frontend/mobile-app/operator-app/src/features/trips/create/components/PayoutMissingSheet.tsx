/**
 * Shown when an own-fleet trip has no driver payout — as soon as a quotation
 * without one is picked, and again on Review trip. A trip can't be created
 * without a payout; "Save it on the quotation too" also writes it back so the
 * next trip on that route fills it in. Mirrors the web DriverPayoutMissingDialog.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { Colors, Spacing, Radius } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { ErrorText, Label, TextField, tap } from './ui';

export function PayoutMissingSheet({
  visible,
  quotationLabel,
  hasQuotation,
  onClose,
  onSave,
}: {
  visible: boolean;
  /** e.g. "QT-83 · Riyadh → Jeddah · 5 TON"; empty when no saved quotation is used. */
  quotationLabel?: string;
  hasQuotation: boolean;
  onClose: () => void;
  onSave: (payout: string, saveOnQuotation: boolean) => void;
}) {
  const [value, setValue] = useState('');
  const [saveOnQuotation, setSaveOnQuotation] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setValue('');
    setSaveOnQuotation(true);
    setError(null);
  }, [visible]);

  const save = () => {
    const n = Number(value);
    if (!value.trim() || !Number.isFinite(n) || n <= 0) {
      setError('Enter a payout above 0');
      return;
    }
    tap();
    onSave(String(n), hasQuotation && saveOnQuotation);
  };

  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title="Driver payout not entered">
      <View style={styles.note}>
        <CircleAlert size={16} color={Colors.warning} strokeWidth={2.3} />
        <Text style={styles.noteText}>
          {quotationLabel ? `${quotationLabel} has no driver payout.` : 'This trip has no driver payout.'} Enter it to create the trip.
        </Text>
      </View>

      <Label>Driver payout for this trip</Label>
      <TextField
        value={value}
        onChangeText={(v) => {
          setValue(v);
          setError(null);
        }}
        prefix="SAR"
        placeholder="160"
        keyboardType="decimal-pad"
        error={Boolean(error)}
      />
      <ErrorText>{error}</ErrorText>

      {hasQuotation ? (
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Save it on the quotation too</Text>
            <Text style={styles.toggleHint}>Next trips on this route fill it in</Text>
          </View>
          <Switch
            value={saveOnQuotation}
            onValueChange={setSaveOnQuotation}
            trackColor={{ true: Colors.primary, false: Colors.gray200 }}
            thumbColor={Colors.white}
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.btnGhostText}>Enter later</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={save} activeOpacity={0.85}>
          <Text style={styles.btnPrimaryText}>Save payout</Text>
        </TouchableOpacity>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: Colors.warningLight,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  noteText: { flex: 1, fontSize: 13, color: Colors.charcoal, lineHeight: 18 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md },
  toggleTitle: { fontSize: 14, fontWeight: '600', color: Colors.charcoal },
  toggleHint: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  btn: { flex: 1, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.white },
  btnGhostText: { fontSize: 15, fontWeight: '600', color: Colors.charcoal },
  btnPrimary: { backgroundColor: Colors.primary },
  btnPrimaryText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
