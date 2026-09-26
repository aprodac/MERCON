import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '@mercon/mobile-shared/theme/tokens';
import { Button } from '@mercon/mobile-shared/components/Button';
import { Card } from '@mercon/mobile-shared/components/Card';
import { Input } from '@mercon/mobile-shared/components/Input';
import { FilterChip } from '@mercon/mobile-shared/components/Badge';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import {
  operatorService, useOperatorQuotationById,
} from '../../../lib/operator';

const QuotationEditScreen = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;
  const { quotation, loading, error } = useOperatorQuotationById(id);

  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [driverPayout, setDriverPayout] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!quotation) return;
    setName(quotation.name || '');
    setRate(quotation.rate != null ? String(quotation.rate) : '');
    setDriverPayout(quotation.driver_payout != null ? String(quotation.driver_payout) : '');
    setIsActive(quotation.is_active ?? true);
  }, [quotation]);

  const isValid = name.trim().length > 0 && rate.trim().length > 0;

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      if (isEditing && id) {
        await operatorService.updateQuotation(id, {
          name: name.trim(),
          rate: Number(rate),
          driver_payout: driverPayout ? Number(driverPayout) : null,
          is_active: isActive,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      router.back();
    } catch (e) {
      Alert.alert(`Could not save quotation`, getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.gray900} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Quotation' : 'New Quotation'}</Text>
        <View style={styles.placeholder} />
      </View>

      {isEditing && loading && !quotation ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing['3xl'] }} />
      ) : isEditing && !quotation ? (
        <Text style={styles.errorText}>{error ?? 'Quotation not found'}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Details</Text>
          <Card style={styles.formCard}>
            <Input label="Quotation Name" value={name} onChangeText={setName} placeholder="e.g. Riyadh → Dammam" />
            <View style={styles.formDivider} />
            <Input label="Billing Rate" value={rate} onChangeText={setRate} placeholder="500.00" keyboardType="decimal-pad" />
            <View style={styles.formDivider} />
            <Input label="Driver Charge (Payout)" value={driverPayout} onChangeText={setDriverPayout} placeholder="45.00" keyboardType="decimal-pad" />
          </Card>

          {isEditing && (
            <>
              <Text style={styles.sectionTitle}>Status</Text>
              <View style={styles.chipRow}>
                <FilterChip label="Active" active={isActive} onPress={() => setIsActive(true)} />
                <FilterChip label="Inactive" active={!isActive} onPress={() => setIsActive(false)} />
              </View>
            </>
          )}

          <Button
            title={saving ? 'Saving…' : 'Save Changes'}
            onPress={handleSave}
            disabled={!isValid || saving}
            loading={saving}
            style={{ marginTop: Spacing.lg }}
          />

          {!isValid && (
            <Text style={styles.validationHint}>Fill in quotation name and rate to continue.</Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: '700',
    color: Colors.gray900,
  },
  placeholder: {
    width: 40,
  },
  errorText: {
    fontSize: Typography.sm,
    color: Colors.error,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray500,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  formCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  formDivider: {
    height: 1,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  validationHint: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});

export default QuotationEditScreen;
