/**
 * Route: /ledger — every trip by trip number, on its own page (owner 30 Oct: "split the
 * ledger page completely and make it cleaner"; it used to be a mode of Trips › History).
 * The bottom bar's Ledger button opens it. Filters, the summary and the list are TripLedger.
 */
import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AppTopBar } from '@/components/AppTopBar';
import { operatorService, type OperatorTrip } from '../../../lib/operator';
import { makeTime } from '../list/tripListModel';
import { useNow } from '../list/useTripList';
import { TripLedger } from '../list/TripLedger';
import { CompanyFilterSheet } from '../list/CompanyFilterSheet';

export default function LedgerScreen() {
  const router = useRouter();
  const now = useNow();
  const tz = useQuery({ queryKey: ['trips', 'tz'], queryFn: () => operatorService.deploymentTimezone(), staleTime: Infinity }).data ?? 'Asia/Riyadh';
  const f = useMemo(() => makeTime(tz), [tz]);
  const todayKey = f.dayKey(now);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [pickingCustomer, setPickingCustomer] = useState(false);

  return (
    <SafeAreaView style={s.page} edges={['top']}>
      <AppTopBar title="Trip ledger" />
      <View style={{ flex: 1 }}>
        <TripLedger
          f={f}
          todayKey={todayKey}
          scope={customer ? { customer_id: customer.id } : undefined}
          customer={customer?.name ?? null}
          onPickCustomer={() => setPickingCustomer(true)}
          onClearCustomer={() => setCustomer(null)}
          onOpen={(t: OperatorTrip) => router.push({ pathname: '/trip-details', params: { id: t.id } })}
        />
      </View>
      <CompanyFilterSheet
        visible={pickingCustomer}
        onClose={() => setPickingCustomer(false)}
        onPick={(c) => { setPickingCustomer(false); setCustomer(c); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F5F8' },
});
