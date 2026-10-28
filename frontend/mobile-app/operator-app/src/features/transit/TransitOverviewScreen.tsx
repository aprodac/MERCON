/**
 * Route: /transit — Transit times (side menu). Every customer's quotation
 * routes on one page: a map of the routes place to place (the picked one
 * bold, A → B), then each route once with its Given TT — what Create trip
 * plans for new trips, in every truck size — the actual average of the last
 * 90 days and how it compares. Admin / Operator set the Given TT, use the
 * actual average or reset it right here; a customer's own Transit times page
 * keeps the per-trip detail.
 */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, RotateCcw, Search, SquarePen, X } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { AppTopBar } from '@/components/AppTopBar';
import { operatorService } from '../../lib/operator';
import { Card, INK, MUTED, PAGE, tap } from '../trips/details/components/parts';
import { niceName } from '../trips/create/components/ui';
import { TransitSheet } from '../trips/create/components/TransitSheet';
import { RouteSketch } from './RouteSketch';
import { RoutesMap } from './RoutesMap';
import { TONE, hm, overText, overviewRoutes, quotationRouteMatches, routeKm, routeTone, type OverviewRoute } from './transitModel';

type Filter = 'all' | 'set' | 'unset' | 'late';
const FILTERS: [Filter, string][] = [['all', 'All'], ['set', 'Given TT set'], ['unset', 'Not set'], ['late', 'Running late']];
const SOURCE = { road: 'road route', approx: 'distance', duty: 'duty length' } as const;

export default function TransitOverviewScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const canSet = role === 'Admin' || role === 'Operator';
  const q = useQuery({ queryKey: ['transit', 'overview'], queryFn: () => operatorService.transitOverview() });
  const all = useMemo(() => overviewRoutes(q.data ?? []), [q.data]);
  const [customer, setCustomer] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<OverviewRoute | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const scroll = useRef<ScrollView>(null);

  const late = (r: OverviewRoute) => { const t = routeTone(r); return t === TONE.amber || t === TONE.red; };
  const routes = useMemo(() => all.filter((r) =>
    (!customer || r.customerId === customer)
    && (filter === 'all' || (filter === 'set' ? r.saved : filter === 'unset' ? !r.saved : late(r)))
    && (quotationRouteMatches(r, search) || r.customerName.toLowerCase().includes(search.trim().toLowerCase()))), [all, customer, filter, search]);
  const picked = routes.find((r) => r.uid === pickedId) ?? null;
  const customers = useMemo(() => (q.data ?? []).map((c) => ({ id: c.customerId, name: c.name, n: all.filter((r) => r.customerId === c.customerId).length })), [q.data, all]);
  const kpi = { routes: all.length, set: all.filter((r) => r.saved).length, late: all.filter(late).length };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['transit'] });
  const run = async (r: OverviewRoute, work: () => Promise<void>, ok: string, fail: string) => {
    if (busy) return;
    setBusy(r.uid);
    try {
      await work();
      setToast({ text: ok });
      await refresh();
    } catch {
      setToast({ text: fail, error: true });
    } finally {
      setBusy(null);
    }
  };
  const save = (r: OverviewRoute, min: number) => {
    setEditing(null);
    return run(r, () => operatorService.setPlannedTransit(r.customerId, r.key, min), `${niceName(r.from)} → ${niceName(r.to)}: new trips plan ${hm(min)}`, 'Couldn’t save the time');
  };
  const reset = (r: OverviewRoute) =>
    run(r, () => operatorService.clearPlannedTransit(r.customerId, r.key), 'Given TT reset — new trips plan what Create trip works out', 'Couldn’t reset the time');
  const pick = (r: OverviewRoute) => {
    tap();
    setPickedId(pickedId === r.uid ? null : r.uid);
    // Back up to the map so the route just picked is in view.
    if (pickedId !== r.uid) scroll.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <SafeAreaView style={s.page} edges={['top']}>
      <AppTopBar title="Transit times" />
      <ScrollView
        ref={scroll}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
      >
        <View style={s.kpis}>
          <Kpi value={q.data ? String(kpi.routes) : '—'} label="Routes" />
          <Kpi value={q.data ? String(kpi.set) : '—'} label="Given TT set" tone="#1F4FD1" />
          <Kpi value={q.data ? String(kpi.late) : '—'} label="Running late" tone={kpi.late ? TONE.red.fg : undefined} />
        </View>

        {q.isLoading ? <SkeletonBlock height={250} radius={18} /> : <RoutesMap routes={routes} picked={picked} />}
        <Text style={s.hint}>{picked ? 'Tap the route again to see every route.' : 'Tap a route to see it on the map.'}</Text>

        <View style={s.search}>
          <Search size={16} color={MUTED} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search a place, customer or #quote"
            placeholderTextColor="#A0A0AA"
            style={s.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search ? <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search"><X size={16} color={MUTED} /></TouchableOpacity> : null}
        </View>

        {customers.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            <Pill label={`All customers · ${all.length}`} on={!customer} onPress={() => setCustomer(null)} />
            {customers.map((c) => <Pill key={c.id} label={`${niceName(c.name)} · ${c.n}`} on={customer === c.id} onPress={() => setCustomer(customer === c.id ? null : c.id)} />)}
          </ScrollView>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {FILTERS.map(([k, label]) => <Pill key={k} label={label} on={filter === k} onPress={() => setFilter(k)} soft />)}
        </ScrollView>

        {q.isLoading ? (
          <View style={{ gap: 10 }}><SkeletonBlock height={120} radius={16} /><SkeletonBlock height={120} radius={16} /></View>
        ) : q.isError ? (
          <View style={{ alignItems: 'center' }}>
            <EmptyState title="Couldn’t load the routes" subtitle="Check the connection and try again." />
            <TouchableOpacity style={s.retry} onPress={() => { tap(); q.refetch(); }}><Text style={s.retryText}>Try again</Text></TouchableOpacity>
          </View>
        ) : !all.length ? (
          <EmptyState title="No routes yet" subtitle="Routes show here once a customer has an active quotation with a pickup and a drop-off." />
        ) : !routes.length ? (
          <EmptyState title="No route matches" subtitle="Change the search or the filters." />
        ) : (
          routes.map((r) => {
            const tone = routeTone(r);
            const on = r.uid === picked?.uid;
            const km = routeKm(r.points);
            const actual5 = r.actualAvgMin != null ? Math.round(r.actualAvgMin / 5) * 5 : null;
            const offerActual = actual5 != null && r.trips >= 3 && actual5 !== r.givenMin && r.source !== 'duty';
            return (
              <TouchableOpacity key={r.uid} activeOpacity={0.85} onPress={() => pick(r)} accessibilityRole="button" accessibilityLabel={`${r.from} to ${r.to}, ${r.customerName}`}>
                <Card style={[s.card, on && s.cardOn, tone && !on ? { borderLeftWidth: 4, borderLeftColor: tone.fg } : null]}>
                  <View style={s.top}>
                    <RouteSketch points={r.points} selected={on} />
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text style={s.route} numberOfLines={2}>{`${niceName(r.from)} → ${niceName(r.to)}`}</Text>
                      <Text style={s.customer} numberOfLines={1}>{niceName(r.customerName)}</Text>
                      <View style={s.tags}>
                        {r.leg === 'return' ? <Tag text="Way back" /> : null}
                        {r.source === 'duty' ? <Tag text="Duty line" /> : null}
                        {r.via ? <Tag text={`${r.via} stop${r.via === 1 ? '' : 's'} between`} /> : null}
                        {km ? <Tag text={`~${km} km`} /> : null}
                      </View>
                    </View>
                    <View style={s.given}>
                      <Text style={s.givenLabel}>Given TT</Text>
                      <Text style={[s.givenValue, !r.saved && { color: INK }]}>{hm(r.givenMin)}</Text>
                      <Text style={s.givenSub}>{r.saved ? 'set by you' : r.source ? SOURCE[r.source] : 'not located'}</Text>
                    </View>
                  </View>

                  <View style={s.stats}>
                    <View style={s.stat}>
                      <Text style={s.statLabel}>Actual avg</Text>
                      <View style={[s.pill, tone && { backgroundColor: tone.bg }]}><Text style={[s.statValue, tone && { color: tone.fg }]}>{hm(r.actualAvgMin)}</Text></View>
                    </View>
                    <View style={s.stat}>
                      <Text style={s.statLabel}>Against TT</Text>
                      <Text style={[s.statValue, tone && { color: tone.fg }]}>{r.trips ? overText(r.actualAvgMin, r.givenMin) || '—' : '—'}</Text>
                    </View>
                    <View style={[s.stat, { flex: 0.8 }]}>
                      <Text style={s.statLabel}>Trips · 90 d</Text>
                      <Text style={s.statValue}>{r.trips}</Text>
                    </View>
                  </View>
                  <Text style={s.quotes} numberOfLines={1}>{`Quotations ${r.quotes.join(' · ')}`}</Text>

                  {on ? (
                    <View style={[s.actions, busy === r.uid && { opacity: 0.5 }]} pointerEvents={busy ? 'none' : 'auto'}>
                      {canSet ? (
                        <>
                          <TouchableOpacity style={[s.btn, s.btnMain]} onPress={() => { tap(); setEditing(r); }} accessibilityRole="button">
                            <SquarePen size={14} color={Colors.white} strokeWidth={2.4} />
                            <Text style={[s.btnText, { color: Colors.white }]}>Set TT</Text>
                          </TouchableOpacity>
                          {offerActual ? (
                            <TouchableOpacity style={s.btn} onPress={() => { tap(); save(r, actual5!); }} accessibilityRole="button">
                              <Text style={s.btnText}>Use actual {hm(actual5)}</Text>
                            </TouchableOpacity>
                          ) : null}
                          {r.saved ? (
                            <TouchableOpacity style={s.btn} onPress={() => { tap(); reset(r); }} accessibilityRole="button">
                              <RotateCcw size={14} color={INK} strokeWidth={2.4} />
                              <Text style={s.btnText}>Reset</Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      ) : null}
                      <TouchableOpacity
                        style={s.btn}
                        onPress={() => { tap(); router.push({ pathname: '/transit-times', params: { customerId: r.customerId, customerName: r.customerName } }); }}
                        accessibilityRole="button"
                      >
                        <Text style={s.btnText}>Trips & detail</Text>
                        <ChevronRight size={14} color={INK} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </Card>
              </TouchableOpacity>
            );
          })
        )}
        <Text style={s.note}>Given TT is what Create trip plans for new trips on the route, in every truck size. Trips already created keep their own times. Colours: green on time (≤15 min over), amber up to 1 h over, red more.</Text>
      </ScrollView>

      <TransitSheet
        visible={editing != null}
        title={editing ? `${niceName(editing.from)} → ${niceName(editing.to)}` : 'Transit time'}
        value={editing ? editing.givenMin : null}
        arrivalText={(m) => (editing?.actualAvgMin != null ? `Actual avg ${hm(editing.actualAvgMin)} · new trips plan ${hm(m)}` : `New trips plan ${hm(m)}`)}
        onDone={(m) => editing && save(editing, m)}
        onClose={() => setEditing(null)}
      />
      <Toast visible={Boolean(toast)} message={toast?.text ?? ''} type={toast?.error ? 'error' : 'success'} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}

function Kpi({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <View style={s.kpi}>
      <Text style={[s.kpiValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={s.kpiLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Pill({ label, on, onPress, soft }: { label: string; on: boolean; onPress: () => void; soft?: boolean }) {
  return (
    <TouchableOpacity onPress={() => { tap(); onPress(); }} style={[s.chip, on && (soft ? s.chipSoftOn : s.chipOn)]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[s.chipText, on && (soft ? s.chipSoftTextOn : s.chipTextOn)]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function Tag({ text }: { text: string }) {
  return <View style={s.tag}><Text style={s.tagText}>{text}</Text></View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE },
  body: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  kpis: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, backgroundColor: Colors.white, borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ECECEF' },
  kpiValue: { fontSize: 22, fontWeight: '800', color: INK },
  kpiLabel: { fontSize: 12, fontWeight: '600', color: MUTED, marginTop: 2 },
  hint: { fontSize: 12, color: MUTED, marginTop: -4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E4E4E8' },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: INK },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#E4E4E8', maxWidth: 220 },
  chipOn: { backgroundColor: INK, borderColor: INK },
  chipSoftOn: { backgroundColor: '#EEF1FB', borderColor: '#C9D4F5' },
  chipText: { fontSize: 13, fontWeight: '700', color: INK },
  chipTextOn: { color: Colors.white },
  chipSoftTextOn: { color: '#1F4FD1', fontWeight: '800' },
  retry: { backgroundColor: INK, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: Colors.white, fontWeight: '800' },
  card: { padding: 12, gap: 10 },
  cardOn: { borderWidth: 2, borderColor: '#1F4FD1' },
  top: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  route: { fontSize: 15, fontWeight: '800', color: INK },
  customer: { fontSize: 12.5, fontWeight: '700', color: MUTED },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, backgroundColor: '#F1F1F3' },
  tagText: { fontSize: 10.5, fontWeight: '700', color: MUTED },
  given: { alignItems: 'flex-end', minWidth: 74 },
  givenLabel: { fontSize: 10.5, fontWeight: '800', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  givenValue: { fontSize: 20, fontWeight: '800', color: '#1F4FD1' },
  givenSub: { fontSize: 10.5, fontWeight: '600', color: MUTED },
  stats: { flexDirection: 'row', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0F2' },
  stat: { flex: 1, gap: 3 },
  statLabel: { fontSize: 10.5, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 15, fontWeight: '800', color: INK },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 7, marginLeft: -7 },
  quotes: { fontSize: 11.5, fontWeight: '600', color: MUTED },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F1F1F3' },
  btnMain: { backgroundColor: INK },
  btnText: { fontSize: 13, fontWeight: '800', color: INK },
  note: { fontSize: 12, color: MUTED },
});
