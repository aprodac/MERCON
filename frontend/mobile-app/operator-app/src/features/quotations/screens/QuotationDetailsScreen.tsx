/**
 * Route: /quotation-details?id= — one quotation.
 *
 * A dark summary card (who it is for, from → to, the rate and what the driver
 * gets), the terms as four small tiles, and the stops as a timeline. Reads the
 * same cached list as the quotations page. Each fact appears once.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, CalendarDays, Layers, Repeat, SquarePen, Tag, Truck, type LucideIcon } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { niceName } from '@/features/trips/create/components/ui';
import { INK, MUTED, PAGE } from '@/features/trips/details/components/parts';
import { QUOTATION_STATUS } from '../components';
import { useQuotations } from '../hooks';
import { formatCurrency, formatValidityRange } from '../services/quotationsService';

const PICKUP = '#1F9D55';

export default function QuotationDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { quotations, loading, error, refresh, isRefreshing } = useQuotations();
  const q = quotations.find((x) => x.id === id);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/quotations'));

  const body = () => {
    if (loading && !q) return <View style={{ gap: 12 }}><SkeletonBlock height={230} radius={24} /><SkeletonBlock height={150} radius={16} /></View>;
    if (error && !q) return <ErrorState message={error} onRetry={() => refresh()} />;
    if (!q) return <EmptyState Icon={Tag} title="Quotation not found" subtitle="It may have been removed." />;

    const st = QUOTATION_STATUS[q.validityStatus] ?? QUOTATION_STATUS.Inactive;
    // Only meaningful for a per-trip rate; a monthly rate and a per-day pay don't compare.
    const margin = !q.isMonthly && q.driverPayout !== null ? q.rate - q.driverPayout : null;
    const terms: { icon: LucideIcon; label: string; value: string }[] = [
      { icon: Truck, label: 'Truck type', value: q.vehicleClass },
      { icon: Repeat, label: 'Line type', value: q.lineType },
      { icon: Layers, label: 'Operation', value: q.operationType },
      { icon: CalendarDays, label: 'Valid', value: formatValidityRange(q.validFrom, q.validTo) },
    ].filter((t) => !!t.value);
    const via = Math.max(0, q.stops.length - 2);

    return (
      <>
        {/* 0 · summary */}
        <View style={s.hero}>
          <View style={s.heroTop}>
            <Text style={s.customer} numberOfLines={2}>{niceName(q.customerName)}</Text>
            <View style={[s.status, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <View style={[s.statusDot, { backgroundColor: st.dot }]} />
              <Text style={s.statusText}>{st.label}</Text>
            </View>
          </View>

          <View style={s.fromTo}>
            <View style={s.place}>
              <Text style={s.placeLabel}>From</Text>
              <Text style={s.placeName} numberOfLines={2}>{q.firstStop}</Text>
            </View>
            <View style={s.arrow}><ArrowRight size={18} color="#FFFFFF" strokeWidth={2.4} /></View>
            <View style={[s.place, { alignItems: 'flex-end' }]}>
              <Text style={s.placeLabel}>To</Text>
              <Text style={[s.placeName, { textAlign: 'right' }]} numberOfLines={2}>{q.lastStop}</Text>
            </View>
          </View>
          {via > 0 ? <Text style={s.viaText}>via {via} {via === 1 ? 'stop' : 'stops'} in between</Text> : null}

          <View style={s.money}>
            <View style={{ flex: 1 }}>
              <Text style={s.moneyLabel}>{q.isMonthly ? 'Rate per month' : 'Rate per trip'}</Text>
              <Text style={s.rate} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(q.rate, q.currency)}</Text>
              {q.isMonthly && q.dailyEquivalent !== null ? <Text style={s.moneySub}>≈ {formatCurrency(q.dailyEquivalent, q.currency)} / day</Text> : null}
            </View>
            {q.driverPayout !== null ? (
              <View style={s.moneySide}>
                <Text style={s.moneyLabel}>Driver pay</Text>
                <Text style={s.sideValue} numberOfLines={1}>{formatCurrency(q.driverPayout, q.currency)}</Text>
                {margin !== null ? <Text style={s.moneySub}>Margin {formatCurrency(margin, q.currency)}</Text> : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* 1 · terms */}
        <View style={s.grid}>
          {terms.map((t) => (
            <View key={t.label} style={s.term}>
              <View style={s.termIcon}><t.icon size={17} color={INK} strokeWidth={2.1} /></View>
              <Text style={s.termLabel}>{t.label}</Text>
              <Text style={s.termValue} numberOfLines={2}>{t.value}</Text>
            </View>
          ))}
        </View>

        {/* 2 · stops, in order */}
        <View style={s.block}>
          <View style={s.headRow}>
            <Text style={s.heading}>Route</Text>
            {q.stops.length > 0 ? <Text style={s.count}>{q.stops.length} stops</Text> : null}
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
        <Text style={s.barTitle}>{q?.quotationNumber ? `Quotation QT-${q.quotationNumber}` : 'Quotation'}</Text>
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
  barTitle: { fontSize: 16, fontWeight: '700', color: INK },
  scroll: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 48, gap: 20 },

  hero: { backgroundColor: INK, borderRadius: 24, padding: 20, gap: 18 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  customer: { flex: 1, fontSize: 13, fontWeight: '600', color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: 0.6, lineHeight: 18 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  fromTo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  place: { flex: 1, gap: 4 },
  placeLabel: { fontSize: 11, fontWeight: '600', color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: 0.8 },
  placeName: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.4, lineHeight: 27 },
  arrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  viaText: { fontSize: 12, color: '#A1A1AA', marginTop: -8 },
  money: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, paddingTop: 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  moneyLabel: { fontSize: 12, color: '#A1A1AA' },
  rate: { fontSize: 30, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.8, fontVariant: ['tabular-nums'], marginTop: 2 },
  moneySub: { fontSize: 12, color: '#A1A1AA', marginTop: 3 },
  moneySide: { alignItems: 'flex-end' },
  sideValue: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'], marginTop: 2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  term: { width: '48.5%', backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', padding: 14, gap: 4 },
  termIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  termLabel: { fontSize: 12, color: MUTED },
  termValue: { fontSize: 15, fontWeight: '700', color: INK },

  block: { gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2, marginLeft: 2 },
  count: { fontSize: 13, color: MUTED },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 16, paddingVertical: 8 },
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
