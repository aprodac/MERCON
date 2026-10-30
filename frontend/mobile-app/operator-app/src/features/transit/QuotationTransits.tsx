/**
 * Transit times › Quotations: every route of the customer's active quotations,
 * once — the same places on two quotations or in two truck sizes are one route,
 * since a route takes the same time in every truck (owner, TestFlight 28 Oct).
 * Given TT is what new trips plan with: the time set here, else what Create
 * trip works out. Admin / Operator set it by hand, use the actual average, or
 * reset it; a time set here plans every truck size.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Search, SquarePen, X } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { operatorService } from '../../lib/operator';
import { Card, INK, MUTED, tap } from '../trips/details/components/parts';
import { niceName } from '../trips/create/components/ui';
import { TransitSheet } from '../trips/create/components/TransitSheet';
import { hm, quotationRouteMatches, quotationRoutes, type QuotationRoute } from './transitModel';

export function QuotationTransits({ customerId }: { customerId: string }) {
  const { role } = useAuth();
  const canSet = role === 'Admin' || role === 'Operator';
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['transit', customerId, 'quotations'], queryFn: () => operatorService.quotationTransits(customerId), enabled: !!customerId });
  const routes = useMemo(() => quotationRoutes(q.data ?? []), [q.data]);
  const [search, setSearch] = useState('');
  const shown = useMemo(() => routes.filter((r) => quotationRouteMatches(r, search)), [routes, search]);
  const [editing, setEditing] = useState<QuotationRoute | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  // The route being saved: its buttons are locked so a double tap can't send two times.
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['transit', customerId] });
  const run = async (r: QuotationRoute, work: () => Promise<void>, ok: string, fail: string) => {
    if (busy) return;
    setBusy(r.id);
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
  const save = (r: QuotationRoute, min: number) => {
    setEditing(null);
    return run(r, () => operatorService.setPlannedTransit(customerId, r.key, min), `${niceName(r.from)} → ${niceName(r.to)}: new trips plan ${hm(min)}, every truck size`, 'Couldn’t save the time');
  };
  const reset = (r: QuotationRoute) =>
    run(r, () => operatorService.clearPlannedTransit(customerId, r.key), 'Given TT reset — new trips plan what Create trip works out', 'Couldn’t reset the time');

  if (q.isLoading) return <View style={{ gap: 10 }}><SkeletonBlock height={110} radius={16} /><SkeletonBlock height={110} radius={16} /></View>;
  if (q.isError) return <EmptyState title="Couldn’t load the quotations" subtitle="Pull down to try again." />;
  if (!routes.length) return <EmptyState title="No quotations with a route" subtitle="Quotations show here once they have a pickup and a drop-off." />;

  return (
    <View style={{ gap: 12 }}>
      <View style={s.search}>
        <Search size={16} color={MUTED} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${routes.length} route${routes.length === 1 ? '' : 's'}`}
          placeholderTextColor="#A0A0AA"
          style={s.searchInput}
          autoCorrect={false}
          returnKeyType="search"
        />
        {search ? <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search"><X size={16} color={MUTED} /></TouchableOpacity> : null}
      </View>

      {!shown.length ? <EmptyState title={`No route matches “${search.trim()}”`} subtitle="Search by a place or a quotation number." /> : null}

      {shown.map((r) => {
        // Offered with 3+ trips when it would change the Given TT; never on a duty line, whose length is the duty, not the drive.
        const actual5 = r.actualAvgMin != null ? Math.round(r.actualAvgMin / 5) * 5 : null;
        const offerActual = actual5 != null && r.trips >= 3 && actual5 !== r.givenMin && r.source !== 'duty';
        return (
          <Card key={r.id} style={{ padding: 14, gap: 10 }}>
            <View style={{ gap: 3 }}>
              <Text style={s.route}>{`${niceName(r.from)} → ${niceName(r.to)}`}</Text>
              <View style={s.tags}>
                {r.leg === 'return' ? <View style={s.tag}><Text style={s.tagText}>Way back</Text></View> : null}
                {r.source === 'duty' ? <View style={s.tag}><Text style={s.tagText}>Duty line</Text></View> : null}
                {r.via ? <View style={s.tag}><Text style={s.tagText}>{`${r.via} stop${r.via === 1 ? '' : 's'} between`}</Text></View> : null}
                <Text style={s.quotes} numberOfLines={1}>{r.quotes.join(' · ')}</Text>
              </View>
            </View>
            <View style={s.nums}>
              <View style={[s.num, { flex: 1.3 }]}>
                <Text style={s.numLabel}>Given TT</Text>
                <Text style={[s.given, !r.saved && { color: MUTED, fontSize: 15 }]}>{r.saved ? hm(r.givenMin) : 'No TT set'}</Text>
                {r.saved ? <Text style={s.numSub}>set by you · every size</Text> : null}
              </View>
              <View style={s.num}>
                <Text style={s.numLabel}>Actual avg</Text>
                <Text style={s.numValue}>{hm(r.actualAvgMin)}</Text>
                <Text style={s.numSub}>{r.trips ? `${r.trips} trip${r.trips === 1 ? '' : 's'}, 90 days` : 'no trips yet'}</Text>
              </View>
            </View>
            {canSet ? (
              <View style={[s.actions, busy === r.id && { opacity: 0.5 }]} pointerEvents={busy ? 'none' : 'auto'}>
                <TouchableOpacity style={[s.btn, s.btnMain]} onPress={() => { tap(); setEditing(r); }} accessibilityRole="button" accessibilityLabel={`Set the transit time for ${r.from} to ${r.to}`}>
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
              </View>
            ) : null}
          </Card>
        );
      })}
      <Text style={s.note}>Given TT is what Create trip plans for new trips on the route, in every truck size. Trips already created keep their own times.</Text>

      <TransitSheet
        visible={editing != null}
        title={editing ? `${niceName(editing.from)} → ${niceName(editing.to)}` : 'Transit time'}
        value={editing ? editing.givenMin : null}
        arrivalText={(m) => (editing?.actualAvgMin != null ? `Actual avg ${hm(editing.actualAvgMin)} · new trips plan ${hm(m)}` : `New trips plan ${hm(m)}`)}
        onDone={(m) => editing && save(editing, m)}
        onClose={() => setEditing(null)}
      />
      <Toast visible={Boolean(toast)} message={toast?.text ?? ''} type={toast?.error ? 'error' : 'success'} onDismiss={() => setToast(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E4E4E8' },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: INK },
  route: { fontSize: 15, fontWeight: '800', color: INK },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#F1F1F3' },
  tagText: { fontSize: 11, fontWeight: '700', color: MUTED },
  quotes: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: MUTED },
  nums: { flexDirection: 'row', gap: 12 },
  num: { flex: 1, gap: 2 },
  numLabel: { fontSize: 11, fontWeight: '800', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  given: { fontSize: 22, fontWeight: '800', color: '#1F4FD1' },
  numValue: { fontSize: 18, fontWeight: '800', color: INK, marginTop: 2 },
  numSub: { fontSize: 11, color: MUTED, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F1F1F3' },
  btnMain: { backgroundColor: INK },
  btnText: { fontSize: 13, fontWeight: '800', color: INK },
  note: { fontSize: 12, color: MUTED },
});
