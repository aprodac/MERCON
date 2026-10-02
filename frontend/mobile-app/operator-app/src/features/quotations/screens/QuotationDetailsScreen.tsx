/**
 * Route: /quotation-details?id= — one quotation.
 *
 * Who it is for and its route, the rate and driver pay as tiles, the terms
 * (truck, line, operation, validity), and the stops in order. Reads the same
 * cached list as the quotations page. Each fact appears once.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, SquarePen, Tag } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { niceName } from '@/features/trips/create/components/ui';
import { Chip, INK, MUTED, PAGE } from '@/features/trips/details/components/parts';
import { QUOTATION_STATUS } from '../components';
import { useQuotations } from '../hooks';
import { formatCurrency, formatValidityRange } from '../services/quotationsService';

export default function QuotationDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { quotations, loading, error, refresh, isRefreshing } = useQuotations();
  const q = quotations.find((x) => x.id === id);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/quotations'));

  const body = () => {
    if (loading && !q) return <View style={{ gap: 12 }}>{[0, 1, 2].map((i) => <SkeletonBlock key={i} height={90} radius={16} />)}</View>;
    if (error && !q) return <ErrorState message={error} onRetry={() => refresh()} />;
    if (!q) return <EmptyState Icon={Tag} title="Quotation not found" subtitle="It may have been removed." />;

    const st = QUOTATION_STATUS[q.validityStatus] ?? QUOTATION_STATUS.Inactive;
    const terms: { label: string; value: string }[] = [
      { label: 'Truck type', value: q.vehicleClass },
      { label: 'Line type', value: q.lineType },
      { label: 'Operation', value: q.operationType },
      { label: 'Valid', value: formatValidityRange(q.validFrom, q.validTo) },
    ].filter((r) => !!r.value);

    return (
      <>
        {/* 0 · who and where */}
        <View style={s.hero}>
          <Text style={s.customer} numberOfLines={2}>{niceName(q.customerName)}</Text>
          <Text style={s.route}>
            {q.firstStop}
            <Text style={s.arrow}>{'  →  '}</Text>
            {q.lastStop}
          </Text>
          <Chip label={st.label} tone={st.tone} dot style={{ alignSelf: 'center', marginTop: 4 }} />
        </View>

        {/* 1 · the money */}
        <View style={s.tiles}>
          <View style={[s.tile, { flex: 1.3 }]}>
            <Text style={s.tileValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(q.rate, q.currency)}</Text>
            <Text style={s.tileLabel}>{q.isMonthly ? 'Rate per month' : 'Rate per trip'}</Text>
            {q.isMonthly && q.dailyEquivalent !== null ? <Text style={s.tileSub}>≈ {formatCurrency(q.dailyEquivalent, q.currency)} / day</Text> : null}
          </View>
          {q.driverPayout !== null ? (
            <View style={s.tile}>
              <Text style={s.tileValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(q.driverPayout, q.currency)}</Text>
              <Text style={s.tileLabel}>Driver pay</Text>
            </View>
          ) : null}
        </View>

        {/* 2 · terms */}
        <View style={s.block}>
          <Text style={s.heading}>Terms</Text>
          <View style={s.card}>
            {terms.map((r, i) => (
              <View key={r.label} style={[s.info, i > 0 && s.border]}>
                <Text style={s.infoLabel}>{r.label}</Text>
                <Text style={s.infoValue}>{r.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 3 · the stops, in order */}
        <View style={s.block}>
          <View style={s.headRow}>
            <Text style={s.heading}>Route</Text>
            {q.stops.length > 0 ? <Text style={s.count}>{q.stops.length}</Text> : null}
          </View>
          <View style={s.card}>
            {q.stops.length === 0 ? (
              <Text style={s.empty}>{q.firstStop} → {q.lastStop}</Text>
            ) : q.stops.map((stop, i) => {
              const last = i === q.stops.length - 1;
              return (
                <View key={stop.id} style={s.stop}>
                  <View style={s.rail}>
                    <View style={[s.pin, i === 0 ? s.pinStart : last ? s.pinEnd : s.pinMid]} />
                    {!last ? <View style={s.railLine} /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2, paddingBottom: last ? 0 : 18 }}>
                    <Text style={s.stopName}>{stop.shortName}</Text>
                    <Text style={s.stopSub} numberOfLines={1}>
                      {[niceName(stop.stopType), stop.canonicalName].filter(Boolean).join('  ·  ')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={s.page} edges={['top']}>
      <View style={s.bar}>
        <TouchableOpacity style={s.barBtn} onPress={back} accessibilityLabel="Back">
          <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
        </TouchableOpacity>
        {q ? (
          <TouchableOpacity style={s.barBtn} onPress={() => router.push({ pathname: '/quotation-edit', params: { id: q.id } })} accessibilityLabel="Edit quotation">
            <SquarePen size={18} color={INK} strokeWidth={2.2} />
          </TouchableOpacity>
        ) : <View style={{ width: 44 }} />}
      </View>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />}
      >
        {body()}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  barBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E9EC' },
  scroll: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 48, gap: 24 },
  hero: { alignItems: 'center', gap: 8, paddingHorizontal: 8 },
  customer: { fontSize: 13, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' },
  route: { fontSize: 24, fontWeight: '700', color: INK, letterSpacing: -0.5, textAlign: 'center', lineHeight: 30 },
  arrow: { color: '#A1A1AA', fontWeight: '400' },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 14, paddingHorizontal: 14, gap: 3 },
  tileValue: { fontSize: 20, fontWeight: '700', color: INK, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 12, color: MUTED },
  tileSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  block: { gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2, marginLeft: 2 },
  count: { fontSize: 13, fontWeight: '600', color: MUTED, backgroundColor: '#EAEAED', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 16 },
  info: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingVertical: 14 },
  border: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  infoLabel: { fontSize: 14, color: MUTED },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: INK },
  stop: { flexDirection: 'row', gap: 14, paddingTop: 16 },
  rail: { alignItems: 'center', width: 12, paddingTop: 5 },
  pin: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: INK },
  pinStart: { backgroundColor: Colors.white },
  pinMid: { backgroundColor: '#E4E4E7', borderColor: '#A1A1AA', width: 10, height: 10, borderRadius: 5 },
  pinEnd: { backgroundColor: INK },
  railLine: { flex: 1, width: 2, backgroundColor: '#E4E4E7', marginTop: 2, marginBottom: -20 },
  stopName: { fontSize: 15, fontWeight: '600', color: INK },
  stopSub: { fontSize: 12, color: MUTED },
  empty: { fontSize: 14, color: MUTED, paddingVertical: 14 },
});
