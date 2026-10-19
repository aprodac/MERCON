/**
 * "Create trip as a previous one" (TestFlight): trips created in the last 24
 * hours; picking one starts this trip from it (useCreateTrip.copyTrip) —
 * customer, quotation or route, and truck. Dates and times stay to be set.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Copy } from 'lucide-react-native';
import { Colors, Radius } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { api } from '@mercon/mobile-shared/lib/api';
import type { OperatorTrip } from '../../../../lib/operator';
import { niceName, tap } from './ui';

const DAY_MS = 24 * 3600_000;

const routeOf = (t: OperatorTrip) => {
  const names = [...(t.stops ?? [])]
    .sort((a: any, b: any) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0))
    .map((s: any) => String(s.location?.name || s.location_name || '').split(',')[0].trim())
    .filter(Boolean);
  return names.filter((n, i) => n !== names[i - 1]).join(' → ');
};

export function RecentTripPicker({ onPick }: { onPick: (t: OperatorTrip) => void }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['trips', 'created-last-day'],
    queryFn: async () => {
      const { data: res } = await api.get('/trips', { params: { per_page: 60 } });
      const since = Date.now() - DAY_MS;
      return ((res?.data ?? []) as OperatorTrip[]).filter((t) => t.customer?.id && t.createdAt && Date.parse(t.createdAt) >= since);
    },
    staleTime: 60_000,
  });
  const trips = data ?? [];
  if (!isLoading && trips.length === 0) return null;

  return (
    <>
      <TouchableOpacity style={s.card} activeOpacity={0.8} onPress={() => { tap(); setOpen(true); }} accessibilityRole="button">
        <View style={s.icon}><Copy size={18} color={Colors.primaryDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Same as a recent trip</Text>
          <Text style={s.sub}>{isLoading ? 'Looking…' : `${trips.length} trip${trips.length === 1 ? '' : 's'} made in the last 24 hours`}</Text>
        </View>
        <ChevronRight size={18} color={Colors.gray500} />
      </TouchableOpacity>

      <AppModal visible={open} onClose={() => setOpen(false)} type="bottom-sheet" title="Start from a recent trip" maxHeight="85%">
        <Text style={s.lead}>Copies the customer, route and price (quotation), and the truck. You set the date and time.</Text>
        {isLoading ? <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} /> : (
          <ScrollView style={{ maxHeight: 460 }}>
            {trips.map((t) => (
              <TouchableOpacity key={t.id} style={s.row} onPress={() => { tap(); setOpen(false); onPick(t); }} activeOpacity={0.7}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{niceName(t.customer?.name)} · {t.ref_id ?? 'Trip'}</Text>
                  <Text style={s.rowRoute} numberOfLines={1}>{routeOf(t) || '—'}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>
                    {[t.vehicle?.plate_number, t.quotation?.name, t.createdAt ? `made ${new Date(t.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={s.use}>Use</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </AppModal>
    </>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14, borderWidth: 1, borderColor: '#FCD9CF' },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: '#3E3C3D' },
  sub: { fontSize: 12.5, color: Colors.gray500, marginTop: 1 },
  lead: { fontSize: 13, color: Colors.gray500, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4E4E7' },
  rowTitle: { fontSize: 14.5, fontWeight: '800', color: '#3E3C3D' },
  rowRoute: { fontSize: 13.5, fontWeight: '600', color: '#3E3C3D' },
  rowSub: { fontSize: 12, color: Colors.gray500 },
  use: { fontSize: 14, fontWeight: '800', color: Colors.primaryDark },
});
