/**
 * Route: /quotation-details?id= — one quotation.
 *
 * A black header (number, status, route, then three equal cells: the rate
 * plus driver pay and margin, or truck and line when there is no driver pay),
 * a Details list, the stops as a timeline, and Edit pinned at the bottom. Reads the same cached list as the
 * quotations page. Each fact appears once.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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

export default function QuotationDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

    // Three equal cells under the route. Money when the quotation has driver pay,
    // otherwise the truck and line — so the header is always full width.
    const cells: { label: string; value: string; sub?: string; good?: boolean }[] = [
      { label: 'Rate', value: formatCurrency(q.rate, cur), sub: q.isMonthly ? 'per month' : 'per trip' },
      ...(q.driverPayout !== null
        ? [
          { label: 'Driver pay', value: formatCurrency(q.driverPayout, cur) },
          margin !== null
            ? { label: 'Margin', value: formatCurrency(margin, cur), good: true }
            : { label: 'About per day', value: q.dailyEquivalent !== null ? formatCurrency(q.dailyEquivalent, cur) : '—' },
        ]
        : [
          { label: 'Truck', value: q.vehicleClass || '—' },
          { label: 'Line', value: q.lineType || '—' },
        ]),
    ];
    const inHeader = new Set(cells.map((c) => c.label));
    const details: { label: string; value: string }[] = [
      { label: 'Customer', value: niceName(q.customerName) },
      ...(!inHeader.has('Truck') ? [{ label: 'Truck type', value: q.vehicleClass }] : []),
      ...(!inHeader.has('Line') ? [{ label: 'Line type', value: q.lineType }] : []),
      { label: 'Operation', value: q.operationType },
      { label: 'Valid', value: formatValidityRange(q.validFrom, q.validTo) },
    ].filter((r) => !!r.value);

    return (
      <>
        {/* 0 · black header: number, route, then three equal cells */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <Text style={s.number}>{q.quotationNumber ? `QT-${q.quotationNumber}` : 'Quotation'}</Text>
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
          <View style={s.cells}>
            {cells.map((c, i) => (
              <View key={c.label} style={[s.cell, i > 0 && s.cellBorder]}>
                <Text style={s.cellLabel} numberOfLines={1}>{c.label}</Text>
                <Text style={[s.cellValue, c.good && { color: '#4ADE80' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{c.value}</Text>
                {c.sub ? <Text style={s.cellSub}>{c.sub}</Text> : null}
              </View>
            ))}
          </View>
        </View>

        {/* 1 · details */}
        <View style={s.block}>
          <Text style={s.heading}>Details</Text>
          <View style={s.card}>
            {details.map((r, i) => (
              <View key={r.label} style={[s.info, i > 0 && s.border]}>
                <Text style={s.infoLabel}>{r.label}</Text>
                <Text style={s.infoValue} numberOfLines={2}>{r.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 2 · stops, in order */}
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
        <View style={{ width: 44 }} />
      </View>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />}
      >
        {body()}
      </ScrollView>
      {q ? (
        <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity style={s.edit} activeOpacity={0.85} onPress={() => router.push({ pathname: '/quotation-edit', params: { id: q.id } })}>
            <SquarePen size={17} color={Colors.white} strokeWidth={2.2} />
            <Text style={s.editText}>Edit quotation</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  barBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER },
  barTitle: { fontSize: 16, fontWeight: '700', color: INK },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 18 },
  foot: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: BORDER },
  edit: { height: 52, borderRadius: 16, backgroundColor: INK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  editText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  header: { backgroundColor: INK, borderRadius: 20, paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  number: { fontSize: 13, fontWeight: '700', color: ON_DARK_MUTED, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.white, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  route: { fontSize: 22, fontWeight: '700', color: Colors.white, letterSpacing: -0.4, lineHeight: 28 },
  arrow: { color: Colors.primary, fontWeight: '400' },
  cells: { flexDirection: 'row', marginTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  cell: { flex: 1, minWidth: 0, paddingVertical: 14, gap: 3 },
  cellBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.14)', paddingLeft: 12 },
  cellLabel: { fontSize: 12, color: ON_DARK_MUTED },
  cellValue: { fontSize: 17, fontWeight: '700', color: Colors.white, letterSpacing: -0.2, fontVariant: ['tabular-nums'], paddingRight: 8 },
  cellSub: { fontSize: 12, color: ON_DARK_MUTED },

  info: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingVertical: 12 },
  border: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  infoLabel: { fontSize: 14, color: MUTED },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: INK },

  block: { gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  count: { fontSize: 13, fontWeight: '600', color: MUTED, backgroundColor: '#EAEAED', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 16 },
  stop: { flexDirection: 'row', gap: 12, paddingTop: 14 },
  rail: { alignItems: 'center', width: 26 },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  railLine: { flex: 1, width: 2, backgroundColor: '#E4E4E7', marginTop: 4, marginBottom: -12 },
  stopText: { flex: 1, minWidth: 0, gap: 3, minHeight: 26, justifyContent: 'center', paddingBottom: 14 },
  stopHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stopName: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
  stopKind: { fontSize: 11, fontWeight: '700', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  stopSub: { fontSize: 12, color: MUTED },
  empty: { fontSize: 14, color: MUTED, paddingVertical: 14 },
});
