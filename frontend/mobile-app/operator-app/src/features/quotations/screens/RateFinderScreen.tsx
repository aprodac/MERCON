/**
 * Route: /rate-finder — "what do we charge for Dammam → Riyadh on a 10 TON?"
 * across every customer. Type a From and/or To place (suggestions come from
 * the places already on quotations), narrow by truck, billing and trip type,
 * and see the price range per truck size plus every matching rate, cheapest
 * first. Works on the same cached quotation list as the quotations page.
 *
 * A route matches when one of its stops matches From and a later stop matches
 * To, so "via" stops count too.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowDownUp, MapPin, Scale, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { lineTypeLabel } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { AppTopBar } from '@/components/AppTopBar';
import { listPage } from '@/components/ListSearch';
import { niceName } from '@/features/trips/create/components/ui';
import { OPERATION_TONE, QuotationRow, lineTypeIcon, truckOrder } from '../components';
import { useQuotations } from '../hooks';
import { outboundStops } from '../services/quotationsService';
import type { QuotationListItem } from '../types';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

const placeNames = (q: QuotationListItem) => outboundStops(q).map((s) => `${s.shortName} ${s.canonicalName ?? ''}`.toLowerCase());

/** Index of the first stop matching `term` at or after `from`, or -1. Empty term matches anywhere. */
function stopIndex(names: string[], term: string, from = 0): number {
  if (!term) return from;
  for (let i = from; i < names.length; i++) if (names[i].includes(term)) return i;
  return -1;
}

function matchesRoute(q: QuotationListItem, from: string, to: string): boolean {
  const names = placeNames(q);
  const a = stopIndex(names, from);
  if (a < 0) return false;
  if (!to) return true;
  return stopIndex(names, to, from ? a + 1 : 0) >= 0;
}

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function RateFinderScreen() {
  const router = useRouter();
  const { quotations, loading, error, refresh } = useQuotations();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [focus, setFocus] = useState<'from' | 'to' | null>(null);
  const [trucks, setTrucks] = useState<string[]>([]);
  const [operation, setOperation] = useState<'' | 'Monthly' | 'Extra'>('');
  const [lineType, setLineType] = useState('');
  const [includeOff, setIncludeOff] = useState(false);

  /** Every place on a quotation, most used first — the suggestions. */
  const places = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    quotations.forEach((q) => q.stops.forEach((s) => {
      const key = s.shortName.trim().toLowerCase();
      if (!key) return;
      const p = m.get(key) ?? { name: niceName(s.shortName.trim()), n: 0 };
      p.n += 1;
      m.set(key, p);
    }));
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [quotations]);
  const typed = focus === 'from' ? from : focus === 'to' ? to : '';
  const suggestions = useMemo(() => {
    const t = typed.trim().toLowerCase();
    return places.filter((p) => !t || p.name.toLowerCase().includes(t)).filter((p) => p.name.toLowerCase() !== t).slice(0, 8);
  }, [places, typed]);

  const f = from.trim().toLowerCase();
  const t = to.trim().toLowerCase();
  const routeMatches = useMemo(
    () => (f || t ? quotations.filter((q) => (includeOff || q.validityStatus === 'Active') && matchesRoute(q, f, t)) : []),
    [quotations, f, t, includeOff],
  );
  const truckOptions = useMemo(() => [...new Set(routeMatches.map((q) => q.vehicleClass))].sort((a, b) => truckOrder(a) - truckOrder(b)), [routeMatches]);
  const lineOptions = useMemo(() => [...new Set(routeMatches.map((q) => q.lineTypeKey))].sort(), [routeMatches]);
  const results = useMemo(
    () => routeMatches
      .filter((q) => (!trucks.length || trucks.includes(q.vehicleClass)) && (!operation || q.operationKey === operation) && (!lineType || q.lineTypeKey === lineType))
      .sort((a, b) => Number(a.isMonthly) - Number(b.isMonthly) || truckOrder(a.vehicleClass) - truckOrder(b.vehicleClass) || a.rate - b.rate),
    [routeMatches, trucks, operation, lineType],
  );

  /** Price range per truck size and rate basis — a monthly and a per-trip price never mix. */
  const ranges = useMemo(() => {
    const m = new Map<string, { truck: string; monthly: boolean; rates: number[]; companies: Set<string> }>();
    results.forEach((q) => {
      const key = `${q.vehicleClass}|${q.isMonthly}`;
      const r = m.get(key) ?? { truck: q.vehicleClass, monthly: q.isMonthly, rates: [], companies: new Set<string>() };
      r.rates.push(q.rate);
      r.companies.add(q.customerId);
      m.set(key, r);
    });
    return [...m.values()]
      .map((r) => ({ ...r, min: Math.min(...r.rates), max: Math.max(...r.rates), avg: r.rates.reduce((a, b) => a + b, 0) / r.rates.length }))
      .sort((a, b) => Number(a.monthly) - Number(b.monthly) || truckOrder(a.truck) - truckOrder(b.truck));
  }, [results]);
  const companies = new Set(results.map((q) => q.customerId)).size;

  const toggleTruck = (v: string) => { Haptics.selectionAsync().catch(() => {}); setTrucks((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v])); };
  const pickPlace = (name: string) => {
    Haptics.selectionAsync().catch(() => {});
    if (focus === 'to') setTo(name); else setFrom(name);
    setFocus(focus === 'from' && !to ? 'to' : null);
  };
  const swap = () => { Haptics.selectionAsync().catch(() => {}); setFrom(to); setTo(from); };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/quotations'));

  const chip = (key: string, label: string, on: boolean, onPress: () => void, Icon?: typeof MapPin, tone?: { fg: string; bg: string }) => (
    <TouchableOpacity key={key} style={[s.chip, on && s.chipOn, !on && tone && { backgroundColor: tone.bg, borderColor: tone.bg }]} activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}>
      {Icon ? <Icon size={13} color={on ? Colors.white : tone?.fg ?? MUTED} strokeWidth={2.3} /> : null}
      <Text style={[s.chipText, on && { color: Colors.white }, !on && tone && { color: tone.fg }]}>{label}</Text>
    </TouchableOpacity>
  );

  const header = (
    <View style={listPage.header}>
      {/* From / To */}
      <View style={s.places}>
        <View style={s.rail}>
          <View style={s.dotFrom} />
          <View style={s.railLine} />
          <View style={s.dotTo} />
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          {([['from', from, setFrom, 'From — e.g. Dammam'], ['to', to, setTo, 'To — e.g. Riyadh']] as const).map(([key, value, set, ph]) => (
            <View key={key} style={[s.input, focus === key && s.inputOn]}>
              <TextInput
                style={s.inputText}
                value={value}
                onChangeText={set}
                placeholder={ph}
                placeholderTextColor="#9898A4"
                autoCorrect={false}
                autoCapitalize="words"
                onFocus={() => setFocus(key)}
                returnKeyType="search"
                accessibilityLabel={key === 'from' ? 'From place' : 'To place'}
              />
              {value ? (
                <TouchableOpacity onPress={() => set('')} hitSlop={10} accessibilityLabel={`Clear ${key}`}>
                  <X size={16} color={MUTED} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
        <TouchableOpacity style={s.swap} onPress={swap} accessibilityLabel="Swap from and to">
          <ArrowDownUp size={17} color={INK} strokeWidth={2.3} />
        </TouchableOpacity>
      </View>

      {focus && suggestions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.chipRow} style={s.bleed}>
          {suggestions.map((p) => chip(`p:${p.name}`, p.name, false, () => pickPlace(p.name), MapPin))}
        </ScrollView>
      ) : null}

      {routeMatches.length > 0 ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.chipRow} style={s.bleed}>
            {chip('op:Monthly', 'Monthly', operation === 'Monthly', () => setOperation(operation === 'Monthly' ? '' : 'Monthly'), undefined, OPERATION_TONE.Monthly)}
            {chip('op:Extra', 'Extra', operation === 'Extra', () => setOperation(operation === 'Extra' ? '' : 'Extra'), undefined, OPERATION_TONE.Extra)}
            {lineOptions.length > 1 ? lineOptions.map((v) => chip(`lt:${v}`, lineTypeLabel(v) || v, lineType === v, () => setLineType(lineType === v ? '' : v), lineTypeIcon(v))) : null}
          </ScrollView>
          {truckOptions.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.chipRow} style={s.bleed}>
              {truckOptions.map((v) => chip(`tr:${v}`, v, trucks.includes(v), () => toggleTruck(v)))}
            </ScrollView>
          ) : null}
        </>
      ) : null}

      <TouchableOpacity style={s.offRow} onPress={() => setIncludeOff((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: includeOff }}>
        <View style={[s.box, includeOff && s.boxOn]} />
        <Text style={s.offText}>Include expired and inactive rates</Text>
      </TouchableOpacity>

      {/* Price range per truck */}
      {ranges.length > 0 ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>{results.length} {results.length === 1 ? 'rate' : 'rates'} from {companies} {companies === 1 ? 'company' : 'companies'}</Text>
          {ranges.map((r, i) => {
            const span = r.max - r.min;
            return (
              <View key={`${r.truck}|${r.monthly}`} style={[s.range, i > 0 && s.rangeBorder]}>
                <View style={{ width: 82 }}>
                  <Text style={s.rangeTruck}>{r.truck}</Text>
                  <Text style={s.rangeSub}>{r.monthly ? 'per month' : 'per trip'} · {r.rates.length}</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={s.bar}>
                    {/* where the average sits between lowest and highest */}
                    <View style={[s.barAvg, { left: `${span > 0 ? ((r.avg - r.min) / span) * 100 : 50}%` }]} />
                  </View>
                  <View style={s.rangeNums}>
                    <Text style={s.rangeNum}>{money(r.min)}</Text>
                    <Text style={[s.rangeNum, { color: MUTED }]}>avg {money(r.avg)}</Text>
                    <Text style={s.rangeNum}>{money(r.max)}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={listPage.page} edges={['top']}>
      <AppTopBar title="Rate finder" onBack={back} />
      {error && quotations.length === 0 ? (
        <ErrorState message={error} onRetry={() => refresh()} className="flex-1" />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(q) => q.id}
          contentContainerStyle={listPage.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListHeaderComponent={header}
          renderItem={({ item }) => <QuotationRow quotation={item} onPress={() => router.push({ pathname: '/quotation-details', params: { id: item.id } })} />}
          ListEmptyComponent={
            loading && quotations.length === 0 ? (
              <View style={{ gap: 8 }}>{[0, 1, 2].map((i) => <SkeletonBlock key={i} height={96} radius={16} />)}</View>
            ) : f || t ? (
              <EmptyState title="No rate for this route" subtitle="Try a shorter place name, another truck, or include expired rates." Icon={Scale} className="mt-8" />
            ) : (
              <EmptyState title="Find a rate" subtitle="Type where the truck loads and where it goes to compare every customer's price." Icon={Scale} className="mt-8" />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  places: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', padding: 10 },
  rail: { alignItems: 'center', paddingVertical: 18, alignSelf: 'stretch' },
  dotFrom: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: INK, backgroundColor: '#FFFFFF' },
  railLine: { flex: 1, width: 2, backgroundColor: '#F7B8AE', marginVertical: 3 },
  dotTo: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  input: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: '#F6F6F7', paddingHorizontal: 12, borderWidth: 1, borderColor: '#F6F6F7' },
  inputOn: { borderColor: Colors.primary, backgroundColor: '#FFFFFF' },
  inputText: { flex: 1, fontSize: 15, color: INK, paddingVertical: 0 },
  swap: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  bleed: { marginHorizontal: -16 },
  chipRow: { gap: 8, paddingHorizontal: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E4E8' },
  chipOn: { backgroundColor: Colors.charcoal, borderColor: Colors.charcoal },
  chipText: { fontSize: 13, fontWeight: '600', color: INK },
  offRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: '#C9C9CF', backgroundColor: '#FFFFFF' },
  boxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  offText: { fontSize: 13, color: MUTED },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 14, paddingVertical: 10 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', paddingBottom: 4 },
  range: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rangeBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  rangeTruck: { fontSize: 14, fontWeight: '700', color: INK },
  rangeSub: { fontSize: 11, color: MUTED },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#FCE1DC' },
  barAvg: { position: 'absolute', top: -3, width: 4, height: 12, marginLeft: -2, borderRadius: 2, backgroundColor: Colors.primary },
  rangeNums: { flexDirection: 'row', justifyContent: 'space-between' },
  rangeNum: { fontSize: 13, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
});
