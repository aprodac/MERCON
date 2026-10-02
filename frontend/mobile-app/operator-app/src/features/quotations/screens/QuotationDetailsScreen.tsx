/**
 * Route: /quotation-details?id= — one quotation, laid out like a rate card.
 *
 * A ticket: number and status, customer, route, the rate in large type, a
 * punched divider, then the line items (driver pay, margin, then the terms).
 * Below it, the stops as a timeline. Reads the same cached list as the
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
import { Chip, INK, MUTED, PAGE } from '@/features/trips/details/components/parts';
import { QUOTATION_STATUS } from '../components';
import { useQuotations } from '../hooks';
import { formatCurrency, formatValidityRange } from '../services/quotationsService';

const PICKUP = '#1F9D55';
const BORDER = '#E9E9EC';
const NOTCH = 22;

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
    if (loading && !q) return <View style={{ gap: 12 }}><SkeletonBlock height={420} radius={24} /><SkeletonBlock height={160} radius={16} /></View>;
    if (error && !q) return <ErrorState message={error} onRetry={() => refresh()} />;
    if (!q) return <EmptyState Icon={Tag} title="Quotation not found" subtitle="It may have been removed." />;

    const st = QUOTATION_STATUS[q.validityStatus] ?? QUOTATION_STATUS.Inactive;
    const cur = q.currency || 'SAR';
    // Only meaningful for a per-trip rate; a monthly rate and a per-day pay don't compare.
    const margin = !q.isMonthly && q.driverPayout !== null ? q.rate - q.driverPayout : null;

    const money: { label: string; value: string; tone?: 'good' }[] = [
      ...(q.driverPayout !== null ? [{ label: 'Driver pay', value: formatCurrency(q.driverPayout, cur) }] : []),
      ...(margin !== null ? [{ label: 'Margin', value: formatCurrency(margin, cur), tone: 'good' as const }] : []),
      ...(q.isMonthly && q.dailyEquivalent !== null ? [{ label: 'About per day', value: formatCurrency(q.dailyEquivalent, cur) }] : []),
    ];
    const terms: { label: string; value: string }[] = [
      { label: 'Truck type', value: q.vehicleClass },
      { label: 'Line type', value: q.lineType },
      { label: 'Operation', value: q.operationType },
      { label: 'Valid', value: formatValidityRange(q.validFrom, q.validTo) },
    ].filter((r) => !!r.value);

    return (
      <>
        {/* 0 · the rate card */}
        <View style={s.ticket}>
          <View style={s.top}>
            <View style={s.topRow}>
              <Text style={s.number}>{q.quotationNumber ? `QT-${q.quotationNumber}` : 'Quotation'}</Text>
              <Chip label={st.label} tone={st.tone} dot />
            </View>
            <Text style={s.customer} numberOfLines={2}>{niceName(q.customerName)}</Text>
            <Text style={s.route}>
              {q.firstStop}
              <Text style={s.arrow}>{'  →  '}</Text>
              {q.lastStop}
            </Text>
          </View>

          <View style={s.rateBlock}>
            <Text style={s.rateLabel}>{q.isMonthly ? 'Rate per month' : 'Rate per trip'}</Text>
            <View style={s.rateRow}>
              <Text style={s.cur}>{cur}</Text>
              <Text style={s.rate} numberOfLines={1} adjustsFontSizeToFit>{amount(q.rate)}</Text>
            </View>
          </View>

          {/* punched divider */}
          <View style={s.perforation}>
            <View style={[s.notch, { left: -NOTCH / 2 }]} />
            <View style={s.dashClip}><View style={s.dash} /></View>
            <View style={[s.notch, { right: -NOTCH / 2 }]} />
          </View>

          <View style={s.items}>
            {money.map((r) => (
              <View key={r.label} style={s.item}>
                <Text style={s.itemLabel}>{r.label}</Text>
                <Text style={[s.itemValue, r.tone === 'good' && { color: '#146C3C' }]}>{r.value}</Text>
              </View>
            ))}
            {money.length > 0 ? <View style={s.rule} /> : null}
            {terms.map((r) => (
              <View key={r.label} style={s.item}>
                <Text style={s.itemLabel}>{r.label}</Text>
                <Text style={s.termValue}>{r.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 1 · stops, in order */}
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
                  <View style={[s.stopText, !last && { paddingBottom: 20 }]}>
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
  scroll: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 48, gap: 24 },

  ticket: { backgroundColor: Colors.white, borderRadius: 24, borderWidth: 1, borderColor: BORDER, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  top: { padding: 20, paddingBottom: 8, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  number: { fontSize: 13, fontWeight: '700', color: MUTED, letterSpacing: 0.8, fontVariant: ['tabular-nums'] },
  customer: { fontSize: 12, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6 },
  route: { fontSize: 24, fontWeight: '700', color: INK, letterSpacing: -0.5, lineHeight: 30 },
  arrow: { color: '#A1A1AA', fontWeight: '400' },

  rateBlock: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24, gap: 4 },
  rateLabel: { fontSize: 12, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8 },
  rateRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  cur: { fontSize: 18, fontWeight: '700', color: MUTED },
  rate: { flexShrink: 1, fontSize: 46, fontWeight: '800', color: INK, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },

  perforation: { height: NOTCH, justifyContent: 'center' },
  notch: { position: 'absolute', top: 0, width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2, backgroundColor: PAGE, borderWidth: 1, borderColor: BORDER },
  dashClip: { height: 1, overflow: 'hidden', marginHorizontal: NOTCH },
  dash: { height: 2, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D4D4D8', borderRadius: 1 },

  items: { padding: 20, paddingTop: 12, gap: 14 },
  item: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 },
  itemLabel: { fontSize: 14, color: MUTED },
  itemValue: { fontSize: 15, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  termValue: { flexShrink: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: INK },
  rule: { height: 1, backgroundColor: '#F1F1F3' },

  block: { gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2, marginLeft: 2 },
  count: { fontSize: 13, fontWeight: '600', color: MUTED, backgroundColor: '#EAEAED', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 16, paddingVertical: 8 },
  stop: { flexDirection: 'row', gap: 14, paddingTop: 12 },
  rail: { alignItems: 'center', width: 26 },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  railLine: { flex: 1, width: 2, backgroundColor: '#E4E4E7', marginTop: 4, marginBottom: -12 },
  stopText: { flex: 1, minWidth: 0, gap: 3, justifyContent: 'center' },
  stopHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stopName: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
  stopKind: { fontSize: 11, fontWeight: '700', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  stopSub: { fontSize: 12, color: MUTED },
  empty: { fontSize: 14, color: MUTED, paddingVertical: 14 },
});
