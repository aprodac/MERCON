/**
 * Route: /quotation-details?id= — one quotation, with everything the web's
 * route drawer shows: the lane and its commercial terms, the stop sequence,
 * the customer's extra charges, and the trips billed on this rate.
 *
 * A ticket (company logo, status, from → to, price), the actions (Create trip
 * on this rate · Duplicate · Share), the same route in other truck sizes, the
 * terms (with margin % and usage), the route drawn from its pins plus every
 * stop, the price history, extra charges and trips. Edit sits top-right.
 * The quotation itself comes from the same cached list as the quotations page.
 */
import React, { useMemo } from 'react';
import { formatQuotationRef } from '@mercon/shared-types';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, History, Share2, SquarePen, Tag, TrendingDown, TrendingUp, Truck, TruckIcon } from 'lucide-react-native';
import { EmptyHint, PageTitle, SectionLabel, FactRow } from '@/components/pageCues';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { niceName } from '@/features/trips/create/components/ui';
import { Card, INK, MUTED, PAGE } from '@/features/trips/details/components/parts';
import { statusChip } from '@/features/trips/details/tripDetailsModel';
import { operatorService } from '@/lib/operator';
import { quotationsApi } from '../api/quotationsApi';
import { CompanyLogo, QuotationBadges, RouteSketch, expiryText, pinnedStops, truckOrder } from '../components';
import { useQuotations } from '../hooks';
import { agoText, formatCurrency, formatValidityRange, marginOf, outboundStops } from '../services/quotationsService';
import type { QuotationListItem, QuotationValidityStatus } from '../types';

const pathKey = (x: QuotationListItem) => outboundStops(x).map((st) => st.shortName.trim().toLowerCase()).join('>');
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

const STATUS_LABEL: Record<QuotationValidityStatus, string> = { Active: 'Active', Future: 'Starts later', Expired: 'Expired', Inactive: 'Inactive' };

export default function QuotationDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { quotations, loading, error, refresh, isRefreshing } = useQuotations();
  const q = quotations.find((x) => x.id === id);

  const chargesQ = useQuery({
    queryKey: ['quotations', 'detail', id, 'charges'],
    queryFn: () => quotationsApi.getSurchargeRules(q!.id, q!.customerId),
    enabled: !!q,
  });
  const tripsQ = useQuery({
    queryKey: ['quotations', 'detail', id, 'trips'],
    queryFn: () => quotationsApi.getTripsUsingRate(q!.id),
    enabled: !!q,
  });
  const trips = useMemo(
    () => [...(tripsQ.data?.trips ?? [])].sort((a, b) => new Date(b.planned_start ?? b.createdAt).getTime() - new Date(a.planned_start ?? a.createdAt).getTime()),
    [tripsQ.data],
  );
  const charges = chargesQ.data ?? [];
  const historyQ = useQuery({
    queryKey: ['quotations', 'detail', id, 'history'],
    queryFn: () => operatorService.quotationHistory(q!.id),
    enabled: !!q,
  });
  const changes = (historyQ.data ?? []).filter((c) => {
    const [r0, r1, p0, p1] = [num(c.old_rate), num(c.new_rate), num(c.old_driver_payout), num(c.new_driver_payout)];
    return (r1 !== null && r1 !== r0) || (p1 !== null && p1 !== p0);
  });

  // The same route (stops, line type, billing) for this customer in other truck sizes.
  const siblings = useMemo(() => {
    if (!q) return [];
    const key = pathKey(q);
    return quotations
      .filter((x) => x.id !== q.id && x.customerId === q.customerId && x.lineTypeKey === q.lineTypeKey && x.operationKey === q.operationKey && pathKey(x) === key)
      .sort((a, b) => truckOrder(a.vehicleClass) - truckOrder(b.vehicleClass) || a.rate - b.rate);
  }, [quotations, q]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/quotations'));
  const reload = () => { refresh(); chargesQ.refetch(); tripsQ.refetch(); historyQ.refetch(); };

  const share = (x: QuotationListItem) => {
    const cur = x.currency || 'SAR';
    const lines = [
      `${niceName(x.customerName)} — ${formatQuotationRef(x.quotationNumber) ?? 'Quotation'}`,
      outboundStops(x).map((st) => niceName(st.shortName)).join(' → '),
      `${x.vehicleClass} · ${x.lineType} · ${x.operationKey}`,
      `Rate: ${formatCurrency(x.rate, cur)} ${x.isMonthly ? 'per month' : 'per trip'}`,
      `Valid: ${formatValidityRange(x.validFrom, x.validTo)}`,
    ];
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  const body = () => {
    if (loading && !q) return <View style={[s.pad16, { gap: 10 }]}><SkeletonBlock height={220} radius={16} /><SkeletonBlock height={44} radius={12} /><SkeletonBlock height={200} radius={16} /></View>;
    if (error && !q) return <View style={s.pad16}><ErrorState message={error} onRetry={() => refresh()} /></View>;
    if (!q) return <View style={s.pad16}><EmptyState Icon={Tag} title="Quotation not found" subtitle="It may have been removed." /></View>;

    const cur = q.currency || 'SAR';
    const live = q.validityStatus === 'Active';
    // Only meaningful for a per-trip rate; a monthly rate and a per-trip pay don't compare.
    const margin = marginOf(q);
    const marginPct = margin !== null && q.rate > 0 ? Math.round((margin / q.rate) * 100) : null;
    const via = q.stops.slice(1, -1).map((x) => x.shortName);
    const expiry = expiryText(q);
    const showRoute = q.stops.length > 2 || pinnedStops(outboundStops(q)).length >= 2;

    const facts: { label: string; value: string; accent?: boolean }[] = [
      { label: 'Truck type', value: q.vehicleClass || '—' },
      { label: 'Line type', value: q.lineType || '—' },
      { label: 'Operation', value: q.operationType || '—' },
      { label: 'Rate basis', value: q.isMonthly ? 'Per month' : 'Per trip' },
      { label: 'Driver pay', value: q.driverPayout !== null ? formatCurrency(q.driverPayout, cur) : 'Not set', accent: q.driverPayout === null },
      ...(margin !== null ? [{ label: 'Margin', value: `${formatCurrency(margin, cur)}${marginPct !== null ? `  (${marginPct}%)` : ''}`, accent: true }] : []),
      ...(q.dailyEquivalent !== null ? [{ label: 'About per day', value: formatCurrency(q.dailyEquivalent, cur) }] : []),
      { label: 'Valid', value: expiry ? `${formatValidityRange(q.validFrom, q.validTo)} · ${expiry.toLowerCase()}` : formatValidityRange(q.validFrom, q.validTo), accent: !!expiry },
      { label: 'Trips on this rate', value: q.tripCount > 0 ? `${q.tripCount}${q.lastTripAt ? `  ·  last ${agoText(q.lastTripAt)}` : ''}` : 'None yet' },
    ];
    const tripTotal = tripsQ.data?.total ?? 0;

    return (
      <View style={s.body}>
        {/* 0 · the quotation as a ticket: who, the lane, the price */}
        <View style={s.ticket}>
          <TouchableOpacity style={s.who} activeOpacity={0.6} onPress={() => router.push({ pathname: '/customer-details', params: { id: q.customerId } })}>
            <CompanyLogo name={q.customerName} uri={q.customerLogo} size={42} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rowTitle} numberOfLines={1}>{niceName(q.customerName)}</Text>
              <Text style={s.sub}>{formatQuotationRef(q.quotationNumber) ?? 'Quotation'}</Text>
            </View>
            <View style={[s.pill, q.validityStatus === 'Expired' && { backgroundColor: Colors.primaryLight }]}>
              <View style={[s.dot, q.validityStatus === 'Expired' && { backgroundColor: Colors.primary }, (q.validityStatus === 'Inactive' || q.validityStatus === 'Future') && { backgroundColor: '#B4B4BC' }]} />
              <Text style={[s.pillText, q.validityStatus === 'Expired' && { color: Colors.primary }, !live && q.validityStatus !== 'Expired' && { color: MUTED }]}>{STATUS_LABEL[q.validityStatus]}</Text>
            </View>
          </TouchableOpacity>

          <View style={s.lane}>
            <View style={s.end}>
              <Text style={s.endLabel}>FROM</Text>
              <Text style={s.city} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{q.firstStop}</Text>
            </View>
            <View style={s.mid}>
              <View style={s.track}>
                <View style={s.trackDot} />
                <View style={s.trackLine} />
                <View style={s.trackTruck}><Truck size={15} color={Colors.white} strokeWidth={2.3} /></View>
                <View style={s.trackLine} />
                <View style={[s.trackDot, { backgroundColor: Colors.primary, borderColor: Colors.primary }]} />
              </View>
              <Text style={s.midText} numberOfLines={1}>{via.length ? `${via.length} via` : 'Direct'}</Text>
            </View>
            <View style={[s.end, { alignItems: 'flex-end' }]}>
              <Text style={s.endLabel}>TO</Text>
              <Text style={[s.city, { textAlign: 'right' }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{q.lastStop}</Text>
            </View>
          </View>

          {/* tear line */}
          <View style={s.tear}>
            <View style={[s.notch, { left: -11 }]} />
            {Array.from({ length: 26 }).map((_, i) => <View key={i} style={s.dash} />)}
            <View style={[s.notch, { right: -11 }]} />
          </View>

          <View style={s.priceRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.endLabel}>{q.isMonthly ? 'RATE PER MONTH' : 'RATE PER TRIP'}</Text>
              <View style={s.priceLine}>
                <Text style={s.cur}>{cur}</Text>
                <Text style={s.price} numberOfLines={1} adjustsFontSizeToFit>{q.rate.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
              </View>
            </View>
            <View style={s.stopsBadge}>
              <Text style={s.stopsNum}>{q.stopsCount}</Text>
              <Text style={s.stopsLabel}>stops</Text>
            </View>
          </View>
        </View>

        {/* actions: book on this rate, copy it for another truck, send it */}
        <View style={s.actions}>
          {live ? (
            <TouchableOpacity style={[s.action, s.actionMain]} activeOpacity={0.85} onPress={() => router.push({ pathname: '/create-trip', params: { customerId: q.customerId, quotationId: q.id } })} accessibilityRole="button">
              <TruckIcon size={17} color={Colors.white} strokeWidth={2.3} />
              <Text style={[s.actionText, { color: Colors.white }]}>Create trip</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={s.action} activeOpacity={0.8} onPress={() => router.push({ pathname: '/quotation-edit', params: { copyFrom: q.id } })} accessibilityRole="button">
            <Copy size={16} color={INK} strokeWidth={2.3} />
            <Text style={s.actionText}>Duplicate</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.action} activeOpacity={0.8} onPress={() => share(q)} accessibilityRole="button">
            <Share2 size={16} color={INK} strokeWidth={2.3} />
            <Text style={s.actionText}>Share</Text>
          </TouchableOpacity>
        </View>

        <QuotationBadges q={q} />

        {/* the same route in other truck sizes — tap to switch */}
        {siblings.length > 0 ? (
          <Card style={{ paddingBottom: 12 }}>
            <SectionLabel>Other truck sizes on this route</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <View style={[s.sib, s.sibOn]}>
                <Text style={[s.sibTruck, { color: 'rgba(255,255,255,0.75)' }]}>{q.vehicleClass}</Text>
                <Text style={[s.sibRate, { color: Colors.white }]}>{q.rate.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
              </View>
              {siblings.map((x) => (
                <TouchableOpacity key={x.id} style={[s.sib, x.validityStatus !== 'Active' && { opacity: 0.55 }]} activeOpacity={0.75} onPress={() => router.setParams({ id: x.id })} accessibilityRole="button" accessibilityLabel={`${x.vehicleClass}, ${formatCurrency(x.rate, x.currency)}`}>
                  <Text style={s.sibTruck}>{x.vehicleClass}</Text>
                  <Text style={s.sibRate}>{x.rate.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Card>
        ) : null}

        {/* 1 · the terms */}
        <Card style={{ paddingVertical: 4 }}>
          {facts.map((f, i) => <FactRow key={f.label} label={f.label} value={f.value} accent={f.accent} first={i === 0} />)}
        </Card>

        {/* 2 · the route drawn from its pins, and every stop when the lane has more than its two ends */}
        {showRoute ? (
          <Card style={{ paddingBottom: 4 }}>
            <SectionLabel>{q.stops.length > 2 ? 'Stops' : 'Route'}</SectionLabel>
            <RouteSketch stops={outboundStops(q)} />
            {q.stops.length <= 2 ? <View style={{ height: 12 }} /> : q.stops.map((stop, i) => {
              const last = i === q.stops.length - 1;
              const end = i === 0 || last;
              return (
                <View key={stop.id} style={s.stop}>
                  <View style={s.stopRail}>
                    <View style={[s.num, end && { backgroundColor: INK }]}>
                      <Text style={[s.numText, end && { color: Colors.white }]}>{i + 1}</Text>
                    </View>
                    {!last ? <View style={s.stopLine} /> : null}
                  </View>
                  <View style={s.stopText}>
                    <View style={s.row}>
                      <Text style={[s.rowTitle, { flex: 1 }]} numberOfLines={2}>{stop.shortName}</Text>
                      <Text style={s.kind}>{niceName(stop.stopType)}</Text>
                    </View>
                    {stop.canonicalName ? <Text style={s.sub} numberOfLines={1}>{stop.canonicalName}</Text> : null}
                  </View>
                </View>
              );
            })}
          </Card>
        ) : null}

        {/* price history: every change to the rate or the driver's pay */}
        <Card style={{ paddingBottom: 4 }}>
          <View style={s.row}>
            <SectionLabel flat>Price history</SectionLabel>
            {changes.length ? <Text style={s.count}>{changes.length}</Text> : null}
          </View>
          {historyQ.isLoading ? <EmptyHint>Loading…</EmptyHint>
            : historyQ.isError ? <EmptyHint>Couldn’t load. Pull down to try again.</EmptyHint>
            : changes.length === 0 ? <EmptyHint>Never changed since it was created.</EmptyHint>
            : changes.slice(0, 8).map((c, i) => {
              const [r0, r1, p0, p1] = [num(c.old_rate), num(c.new_rate), num(c.old_driver_payout), num(c.new_driver_payout)];
              const d = new Date(c.createdAt);
              return (
                <View key={c.id} style={[s.line, i > 0 && s.lineBorder]}>
                  <View style={s.date}>
                    <Text style={s.dateDay}>{d.getDate()}</Text>
                    <Text style={s.dateMonth}>{d.toLocaleDateString(undefined, { month: 'short' })}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    {r1 !== null && r1 !== r0 ? <PriceChange label="Rate" from={r0} to={r1} cur={cur} /> : null}
                    {p1 !== null && p1 !== p0 ? <PriceChange label="Driver pay" from={p0} to={p1} cur={cur} /> : null}
                    <Text style={s.sub} numberOfLines={1}>
                      {[d.getFullYear() !== new Date().getFullYear() ? String(d.getFullYear()) : '', niceName(c.changed_by_name || c.changed_by || ''), c.source === 'TRIP_CREATION' ? 'from a trip' : '', c.reason || ''].filter(Boolean).join('  ·  ')}
                    </Text>
                  </View>
                </View>
              );
            })}
        </Card>

        {/* 3 · extra charges agreed with the customer — only when there are some */}
        {charges.length > 0 ? (
        <Card style={{ paddingBottom: 4 }}>
          <View style={s.row}>
            <SectionLabel flat>Extra charges</SectionLabel>
            {charges.length ? <Text style={s.count}>{charges.length}</Text> : null}
          </View>
          {chargesQ.isLoading ? <EmptyHint>Loading…</EmptyHint>
            : chargesQ.isError ? <EmptyHint>Couldn’t load. Pull down to try again.</EmptyHint>
            : charges.length === 0 ? <EmptyHint>None agreed with this customer.</EmptyHint>
            : charges.map((r, i) => (
              <View key={r.id} style={[s.line, i > 0 && s.lineBorder]}>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{niceName(r.charge_type)}</Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {[r.quotationId ? 'This lane only' : 'All lanes', r.vehicle_type || null].filter(Boolean).join('  ·  ')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 1 }}>
                  <Text style={s.amount}>{formatCurrency(Number(r.rate), r.currency || cur)}</Text>
                  {r.unit ? <Text style={s.sub}>per {r.unit.replace(/^per\s+/i, '')}</Text> : null}
                </View>
              </View>
            ))}
        </Card>
        ) : null}

        {/* 4 · trips billed on this rate — only when there are some */}
        {trips.length > 0 ? (
        <Card style={{ paddingBottom: 4 }}>
          <View style={s.row}>
            <SectionLabel flat>Trips on this rate</SectionLabel>
            {tripTotal ? <Text style={s.count}>{tripTotal}</Text> : null}
          </View>
          {tripsQ.isLoading ? <EmptyHint>Loading…</EmptyHint>
            : tripsQ.isError ? <EmptyHint>Couldn’t load. Pull down to try again.</EmptyHint>
            : trips.length === 0 ? <EmptyHint>No trips have used this rate yet.</EmptyHint>
            : trips.slice(0, 6).map((t, i) => {
              const d = new Date(t.planned_start ?? t.createdAt);
              const driver = t.driver ? niceName(`${t.driver.first_name ?? ''} ${t.driver.last_name ?? ''}`.trim()) : '';
              const amount = t.billing_amount != null ? Number(t.billing_amount) : q.rate;
              return (
                <TouchableOpacity key={t.id} style={[s.line, i > 0 && s.lineBorder]} activeOpacity={0.6} onPress={() => router.push({ pathname: '/trip-details', params: { id: t.id } })}>
                  <View style={s.date}>
                    <Text style={s.dateDay}>{d.getDate()}</Text>
                    <Text style={s.dateMonth}>{d.toLocaleDateString(undefined, { month: 'short' })}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{t.ref_id ?? 'Trip'}</Text>
                    <Text style={s.sub} numberOfLines={1}>{[statusChip(t.status).label, driver || t.vehicle?.plate_number || null].filter(Boolean).join('  ·  ')}</Text>
                  </View>
                  <Text style={s.amount}>{formatCurrency(amount, cur)}</Text>
                </TouchableOpacity>
              );
            })}
        </Card>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <View style={[s.bar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity style={s.barBtn} onPress={back} accessibilityLabel="Back">
          <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
        </TouchableOpacity>
        <PageTitle title="Quotation" />
        {q ? (
          <TouchableOpacity style={s.barBtn} onPress={() => router.push({ pathname: '/quotation-edit', params: { id: q.id } })} accessibilityLabel="Edit quotation">
            <SquarePen size={18} color={INK} strokeWidth={2.2} />
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={reload} tintColor={Colors.primary} />}
      >
        {body()}
      </ScrollView>
    </View>
  );
}

function PriceChange({ label, from, to, cur }: { label: string; from: number | null; to: number; cur: string }) {
  const up = from !== null && to > from;
  const Icon = from === null ? History : up ? TrendingUp : TrendingDown;
  const color = from === null ? MUTED : up ? '#146C3C' : '#B42318';
  return (
    <View style={s.change}>
      <Icon size={14} color={color} strokeWidth={2.4} />
      <Text style={s.changeText} numberOfLines={1}>
        {label}  <Text style={{ color: MUTED }}>{from !== null ? `${formatCurrency(from, cur)} → ` : ''}</Text>
        <Text style={{ fontWeight: '700', color: INK }}>{formatCurrency(to, cur)}</Text>
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E9EC' },
  barTitle: { fontSize: 16, fontWeight: '700', color: INK },
  pad16: { paddingHorizontal: 16 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  number: { fontSize: 13, fontWeight: '700', color: MUTED, letterSpacing: 0.4, fontVariant: ['tabular-nums'] },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F1F1F3' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: INK },
  pillText: { fontSize: 12, fontWeight: '700', color: INK },
  rail: { width: 12, alignItems: 'center', alignSelf: 'stretch', paddingTop: 22, paddingBottom: 6 },
  railDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: INK, backgroundColor: Colors.white },
  railDotEnd: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  railLine: { flex: 1, width: 2, backgroundColor: '#F7B8AE', marginVertical: 2 },
  place: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  ticket: { backgroundColor: Colors.white, borderRadius: 22, borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 16 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F1F1F3' },
  logo: { width: 42, height: 42, borderRadius: 13, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 14, fontWeight: '800', color: Colors.primary },
  lane: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 20 },
  end: { flex: 1, minWidth: 0, gap: 4 },
  endLabel: { fontSize: 11, fontWeight: '700', color: '#9898A4', letterSpacing: 0.8 },
  city: { fontSize: 22, fontWeight: '800', color: INK, letterSpacing: -0.4, lineHeight: 26 },
  mid: { width: 92, alignItems: 'center', gap: 5, paddingTop: 12 },
  track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  trackDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: INK, backgroundColor: Colors.white },
  trackLine: { flex: 1, height: 2, backgroundColor: '#E4E4E8' },
  trackTruck: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  midText: { fontSize: 12, fontWeight: '600', color: MUTED },
  tear: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: -16, paddingHorizontal: 18, height: 22 },
  notch: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: PAGE, borderWidth: 1, borderColor: '#E9E9EC' },
  dash: { width: 6, height: 2, borderRadius: 1, backgroundColor: '#DCDCE0' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 16 },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  fact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 12 },
  factLabel: { fontSize: 14, color: MUTED },
  factValue: { flex: 1, textAlign: 'right', fontSize: 15, fontWeight: '600', color: INK, fontVariant: ['tabular-nums'] },
  cur: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  price: { flexShrink: 1, fontSize: 34, fontWeight: '800', color: INK, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  per: { fontSize: 15, fontWeight: '600', color: MUTED },
  split: { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  splitItem: { flex: 1, minWidth: 0, gap: 2, backgroundColor: '#F6F6F7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  splitValue: { fontSize: 15, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  route: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  stopsBadge: { alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 16, backgroundColor: '#F4F4F5' },
  stopsNum: { fontSize: 18, fontWeight: '800', color: INK, lineHeight: 21 },
  stopsLabel: { fontSize: 11, color: MUTED },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 12, paddingVertical: 12 },
  tileValue: { fontSize: 15, fontWeight: '700', color: INK },
  label: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' },
  count: { fontSize: 12, fontWeight: '700', color: MUTED, backgroundColor: '#F1F1F3', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  sub: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  iconTile: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 12, color: MUTED },
  rowTitle: { fontSize: 15, fontWeight: '600', color: INK },
  money: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  figureValue: { fontSize: 17, fontWeight: '800', color: INK, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  figureLabel: { fontSize: 12, color: MUTED },

  tabsWrap: { paddingHorizontal: 16, paddingVertical: 12 },
  tabs: { flexDirection: 'row', gap: 4, backgroundColor: '#EAEAED', borderRadius: 12, padding: 3 },
  tab: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: 52, borderRadius: 9, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 1 },
  tabOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  tabTextOn: { color: INK, fontWeight: '700' },
  tabCount: { fontSize: 12, fontWeight: '700', color: '#9898A4', fontVariant: ['tabular-nums'] },

  body: { paddingHorizontal: 16, gap: 10 },
  empty: { fontSize: 14, color: MUTED },
  listCard: { paddingVertical: 4 },
  listEmpty: { paddingTop: 8, paddingBottom: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  lineBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  amount: { fontSize: 15, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  date: { width: 40, height: 44, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 16, fontWeight: '700', color: INK, lineHeight: 18 },
  dateMonth: { fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase' },

  stop: { flexDirection: 'row', gap: 12, paddingTop: 12 },
  stopRail: { alignItems: 'center', width: 26 },
  num: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EDEDEF', alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 12, fontWeight: '700', color: INK },
  stopLine: { flex: 1, width: 2, backgroundColor: '#E4E4E8', marginTop: 4, marginBottom: -10 },
  stopText: { flex: 1, minWidth: 0, gap: 2, minHeight: 26, justifyContent: 'center', paddingBottom: 12 },
  kind: { fontSize: 11, fontWeight: '700', color: MUTED, backgroundColor: '#F1F1F3', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },

  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#E9E9EC' },
  actionMain: { flex: 1.3, backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionText: { fontSize: 14, fontWeight: '700', color: INK },
  sib: { minWidth: 84, gap: 1, borderRadius: 12, backgroundColor: '#F6F6F7', paddingHorizontal: 12, paddingVertical: 8 },
  sibOn: { backgroundColor: INK },
  sibTruck: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.3 },
  sibRate: { fontSize: 16, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  change: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeText: { flexShrink: 1, fontSize: 14, color: INK, fontVariant: ['tabular-nums'] },
});
