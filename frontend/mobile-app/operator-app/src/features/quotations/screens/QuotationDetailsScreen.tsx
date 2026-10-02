/**
 * Route: /quotation-details?id= — one quotation.
 *
 * A black header (number, customer, route, the rate and
 * what it is for), driver pay and margin as two tiles, the remaining terms,
 * and the stops as a timeline. Reads the same cached list as the
 * quotations page. Each fact appears once.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, SquarePen, Tag } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { niceName } from '@/features/trips/create/components/ui';
import { INK, MUTED, PAGE } from '@/features/trips/details/components/parts';
import { QUOTATION_STATUS } from '../components';
import { useQuotations } from '../hooks';
import { formatCurrency, formatValidityRange } from '../services/quotationsService';

const PICKUP = '#1F9D55';
const BORDER = '#E9E9EC';
/** Secondary text on the black header. */
const ON_DARK_MUTED = '#A1A1AA';

/** Number only — "SAR" is shown small beside it. */
function amount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default function QuotationDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { quotations, loading, error, refresh, isRefreshing } = useQuotations();
  const q = quotations.find((x) => x.id === id);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/quotations'));

  const body = () => {
    if (loading && !q) return <View style={{ gap: 12 }}><SkeletonBlock height={190} radius={20} /><SkeletonBlock height={84} radius={16} /><SkeletonBlock height={160} radius={16} /></View>;
    if (error && !q) return <ErrorState message={error} onRetry={() => refresh()} />;
    if (!q) return <EmptyState Icon={Tag} title="Quotation not found" subtitle="It may have been removed." />;

    const st = QUOTATION_STATUS[q.validityStatus] ?? QUOTATION_STATUS.Inactive;
    const cur = q.currency || 'SAR';
    // Only meaningful for a per-trip rate; a monthly rate and a per-day pay don't compare.
    const margin = !q.isMonthly && q.driverPayout !== null ? q.rate - q.driverPayout : null;

    const tiles: { label: string; value: string; good?: boolean }[] = [
      ...(q.driverPayout !== null ? [{ label: 'Driver pay', value: formatCurrency(q.driverPayout, cur) }] : []),
      ...(margin !== null ? [{ label: 'Margin', value: formatCurrency(margin, cur), good: true }] : []),
      ...(q.isMonthly && q.dailyEquivalent !== null ? [{ label: 'About per day', value: formatCurrency(q.dailyEquivalent, cur) }] : []),
    ];
    // Truck and line type sit under the rate in the header, so they aren't repeated here.
    const terms: { label: string; value: string }[] = [
      { label: 'Operation', value: q.operationType },
      { label: 'Valid', value: formatValidityRange(q.validFrom, q.validTo) },
    ].filter((r) => !!r.value);
    const basis = [q.isMonthly ? 'per month' : 'per trip', q.lineType, q.vehicleClass].filter(Boolean).join('  ·  ');

    return (
      <>
        {/* 0 · black header: who, where, how much */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <Text style={s.number} numberOfLines={1}>
              {[q.quotationNumber ? `QT-${q.quotationNumber}` : null, niceName(q.customerName)].filter(Boolean).join('  ·  ')}
            </Text>
            <View style={s.status}>
              <View style={[s.statusDot, { backgroundColor: st.dot }]} />
              <Text style={[s.statusText, { color: st.fg }]}>{st.label}</Text>
            </View>
          </View>
          <Text style={s.route}>
            {q.firstStop}
            <Text style={s.arrow}>{'  →  '}</Text>
            {q.lastStop}
          </Text>
          <View style={s.rateRow}>
            <Text style={s.cur}>{cur}</Text>
            <Text style={s.rate} numberOfLines={1} adjustsFontSizeToFit>{amount(q.rate)}</Text>
          </View>
          <Text style={s.basis}>{basis}</Text>
        </View>

        {/* 1 · what the driver gets and what is left */}
        {tiles.length > 0 ? (
          <View style={s.tiles}>
            {tiles.map((x) => (
              <View key={x.label} style={s.tile}>
                <Text style={s.tileLabel}>{x.label}</Text>
                <Text style={[s.tileValue, x.good && { color: '#146C3C' }]} numberOfLines={1} adjustsFontSizeToFit>{x.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* 2 · terms */}
        {terms.length > 0 ? (
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
        ) : null}

        {/* 3 · stops, in order */}
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
              const pickup = /pick/i.test(stop.stopType);
              return (
                <View key={stop.id} style={s.stop}>
                  <View style={s.rail}>
                    <View style={[s.num, { backgroundColor: pickup ? PICKUP : INK }]}>
                      <Text style={s.numText}>{i + 1}</Text>
                    </View>
                    {!last ? <View style={s.railLine} /> : null}
                  </View>
                  <View style={s.stopText}>
                    <View style={s.stopHead}>
                      <Text style={s.stopName} numberOfLines={2}>{stop.shortName}</Text>
                      <Text style={[s.stopKind, { color: pickup ? '#146C3C' : MUTED, backgroundColor: pickup ? '#E8F5EE' : '#F1F1F3' }]}>{niceName(stop.stopType)}</Text>
                    </View>
                    {stop.canonicalName ? <Text style={s.stopSub} numberOfLines={1}>{stop.canonicalName}</Text> : null}
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
        <Text style={s.barTitle}>Quotation</Text>
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
  barBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER },
  barTitle: { fontSize: 16, fontWeight: '700', color: INK },
  scroll: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 48, gap: 20 },

  header: { backgroundColor: INK, borderRadius: 20, padding: 16, gap: 6 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  number: { flex: 1, fontSize: 13, fontWeight: '600', color: ON_DARK_MUTED, fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.white, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  route: { fontSize: 20, fontWeight: '700', color: Colors.white, letterSpacing: -0.3, lineHeight: 26 },
  arrow: { color: Colors.primary, fontWeight: '400' },
  rateRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  cur: { fontSize: 17, fontWeight: '700', color: ON_DARK_MUTED },
  rate: { flexShrink: 1, fontSize: 40, fontWeight: '800', color: Colors.white, letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  basis: { fontSize: 13, color: ON_DARK_MUTED },

  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 4 },
  tileLabel: { fontSize: 12, color: MUTED },
  tileValue: { fontSize: 20, fontWeight: '700', color: INK, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },

  info: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingVertical: 14 },
  border: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  infoLabel: { fontSize: 14, color: MUTED },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: INK },

  block: { gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  count: { fontSize: 13, fontWeight: '600', color: MUTED, backgroundColor: '#EAEAED', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 16 },
  stop: { flexDirection: 'row', gap: 14, paddingTop: 16 },
  rail: { alignItems: 'center', width: 26 },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  railLine: { flex: 1, width: 2, backgroundColor: '#E4E4E7', marginTop: 4, marginBottom: -12 },
  stopText: { flex: 1, minWidth: 0, gap: 3, minHeight: 26, justifyContent: 'center', paddingBottom: 16 },
  stopHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stopName: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
  stopKind: { fontSize: 11, fontWeight: '700', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  stopSub: { fontSize: 12, color: MUTED },
  empty: { fontSize: 14, color: MUTED, paddingVertical: 14 },
});
