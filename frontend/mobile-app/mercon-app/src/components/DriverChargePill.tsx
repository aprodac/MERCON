import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Wallet, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTripHistory } from '../lib/use-trip-history';
import { getTripChargeValue, getMonthlyDriverPayout } from '../lib/trips';
import { useLanguage } from '../lib/language-context';

interface DriverChargePillProps {
  amount?: number;
  style?: ViewStyle;
}

export function DriverChargePill({ amount, style }: DriverChargePillProps) {
  const router = useRouter();
  const { t, language, formatCurrency } = useLanguage();
  const { trips: historyList } = useTripHistory();

  const totalEarnings = useMemo(() => {
    if (typeof amount === 'number') return amount;
    return getMonthlyDriverPayout(historyList);
  }, [amount, historyList]);

  return (
    <TouchableOpacity
      style={[styles.driverChargePill, style]}
      activeOpacity={0.85}
      onPress={() => router.push('/driver-charges' as any)}
    >
      <View style={styles.walletIconCircle}>
        <Wallet size={15} color="#FA634E" strokeWidth={2.2} />
      </View>
      <View style={styles.chargeTextCol}>
        <Text style={[styles.chargeAmount, { writingDirection: 'ltr' }]}>
          {formatCurrency(totalEarnings)}
        </Text>
        <Text style={styles.chargeLabel}>{t('label_driver_charge', 'Driver Charge')}</Text>
      </View>
      {language === 'ur' ? (
        <ChevronLeft size={14} color="#9898A4" strokeWidth={2.2} />
      ) : (
        <ChevronRight size={14} color="#9898A4" strokeWidth={2.2} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  driverChargePill: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3E3C3D',
    borderRadius: 19,
    paddingHorizontal: 12,
    gap: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  walletIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chargeTextCol: {
    justifyContent: 'center',
  },
  chargeAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 15,
  },
  chargeLabel: {
    fontSize: 9.5,
    color: '#D8D8DC',
    lineHeight: 11,
    fontWeight: '500',
  },
});
