import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Plus, Trash2, Zap } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '@mercon/mobile-shared/theme/tokens';
import { Card } from '@mercon/mobile-shared/components/Card';
import { Button } from '@mercon/mobile-shared/components/Button';

export interface AdditionalChargeItem {
  id: string;
  charge_type: string;
  amount: number;
}

export const CHARGE_PRESETS = [
  { type: 'Labor / Offloading', amount: 200 },
  { type: 'Overtime / Detention', amount: 150 },
  { type: 'Same-Day Rush', amount: 100 },
  { type: 'Fuel Surcharge', amount: 250 },
];

interface AdditionalChargesSectionProps {
  charges: AdditionalChargeItem[];
  customChargeType: string;
  setCustomChargeType: (val: string) => void;
  customChargeAmount: string;
  setCustomChargeAmount: (val: string) => void;
  onAddPreset: (preset: { type: string; amount: number }) => void;
  onAddCustomCharge: () => void;
  onRemoveCharge: (id: string) => void;
}

export const AdditionalChargesSection: React.FC<AdditionalChargesSectionProps> = ({
  charges,
  customChargeType,
  setCustomChargeType,
  customChargeAmount,
  setCustomChargeAmount,
  onAddPreset,
  onAddCustomCharge,
  onRemoveCharge,
}) => {
  const totalChargesAmount = charges.reduce((acc, c) => acc + (c.amount || 0), 0);

  return (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>3. Additional Surcharges</Text>
      <Card style={styles.card}>
        <Text style={styles.fieldLabel}>Preset Quick Charges</Text>
        <View style={styles.presetsGrid}>
          {CHARGE_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.type}
              style={styles.presetChip}
              onPress={() => onAddPreset(preset)}
              activeOpacity={0.7}
            >
              <Zap size={13} color={Colors.primary} />
              <Text style={styles.presetChipText}>{preset.type}</Text>
              <Text style={styles.presetChipAmount}>+SAR {preset.amount}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Add Custom Charge</Text>
        <View style={styles.customInputRow}>
          <TextInput
            style={[styles.input, { flex: 2 }]}
            value={customChargeType}
            onChangeText={setCustomChargeType}
            placeholder="Charge description..."
            placeholderTextColor={Colors.gray400}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={customChargeAmount}
            onChangeText={setCustomChargeAmount}
            placeholder="Amount"
            placeholderTextColor={Colors.gray400}
            keyboardType="numeric"
          />
          <Button
            title="+ Add"
            size="sm"
            onPress={onAddCustomCharge}
            disabled={!customChargeType.trim() || !customChargeAmount.trim()}
          />
        </View>

        {charges.length > 0 && (
          <View style={styles.chargesList}>
            <View style={styles.chargesHeaderRow}>
              <Text style={styles.chargesListTitle}>Applied Charges ({charges.length})</Text>
              <Text style={styles.chargesTotalText}>Total: SAR {totalChargesAmount.toLocaleString()}</Text>
            </View>
            {charges.map((item) => (
              <View key={item.id} style={styles.chargeRow}>
                <View style={styles.chargeTextCol}>
                  <Text style={styles.chargeType}>{item.charge_type}</Text>
                </View>
                <Text style={styles.chargeAmount}>+SAR {item.amount.toLocaleString()}</Text>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => onRemoveCharge(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Trash2 size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.headingS.fontSize,
    fontWeight: Typography.headingS.fontWeight,
    color: Colors.charcoal,
    marginBottom: Spacing.xs,
  },
  card: {
    padding: Spacing.md,
  },
  fieldLabel: {
    fontSize: Typography.subcaption,
    fontWeight: '700',
    color: Colors.gray600,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(250, 99, 78, 0.25)',
  },
  presetChipText: {
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.charcoal,
  },
  presetChipAmount: {
    fontSize: Typography.subcaption,
    fontWeight: '700',
    color: Colors.primary,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  input: {
    height: 38,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    fontSize: Typography.xs,
    color: Colors.gray900,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  chargesList: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    gap: Spacing.xs,
  },
  chargesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chargesListTitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  chargesTotalText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  chargeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  chargeTextCol: {
    flex: 1,
  },
  chargeType: {
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.gray900,
  },
  chargeAmount: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.charcoal,
    marginRight: Spacing.sm,
  },
  removeBtn: {
    padding: 2,
  },
});
