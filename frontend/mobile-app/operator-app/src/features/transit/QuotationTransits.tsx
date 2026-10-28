/**
 * Transit times › Quotations: every leg of the customer's active quotations
 * with what Create trip would estimate, the time saved for it (which new trips
 * plan with instead), and what finished trips took. Admin / Operator can set
 * a time by hand or go back to the estimate.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, SquarePen } from 'lucide-react-native';
import { EmptyState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { operatorService, type QuotationTransitLeg } from '../../lib/operator';
import { Card, INK, MUTED, tap } from '../trips/details/components/parts';
import { niceName } from '../trips/create/components/ui';
import { TransitSheet } from '../trips/create/components/TransitSheet';
import { hm } from './transitModel';

const SOURCE = { road: 'road route', approx: 'distance estimate', duty: 'duty length' } as const;

export function QuotationTransits({ customerId }: { customerId: string }) {
  const { role } = useAuth();
  const canSet = role === 'Admin' || role === 'Operator';
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['transit', customerId, 'quotations'], queryFn: () => operatorService.quotationTransits(customerId), enabled: !!customerId });
  const [editing, setEditing] = useState<QuotationTransitLeg | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  // The leg being saved: its buttons are locked so a double tap can't send two times.
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['transit', customerId] });
  const run = async (leg: QuotationTransitLeg, work: () => Promise<void>, ok: string, fail: string) => {
    if (busy) return;
    setBusy(leg.key);
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
  const save = (leg: QuotationTransitLeg, min: number) => {
    setEditing(null);
    return run(leg, () => operatorService.setPlannedTransit(customerId, leg.key, min), `New trips on ${niceName(leg.from)} → ${niceName(leg.to)} ${leg.size} will plan ${hm(min)}`, 'Couldn’t save the time');
  };
  const reset = (leg: QuotationTransitLeg) =>
    run(leg, () => operatorService.clearPlannedTransit(customerId, leg.key), 'Back to the estimate', 'Couldn’t reset the time');

  if (q.isLoading) return <View style={{ gap: 10 }}><SkeletonBlock height={120} radius={16} /><SkeletonBlock height={120} radius={16} /></View>;
  if (q.isError) return <EmptyState title="Couldn’t load the quotations" subtitle="Pull down to try again." />;
  if (!q.data?.length) return <EmptyState title="No quotations with a route" subtitle="Quotations show here once they have a pickup and a drop-off." />;

  return (
    <View style={{ gap: 12 }}>
      {q.data.map((quote) => (
        <Card key={quote.quotationId} style={{ padding: 14, gap: 10 }}>
          <View style={s.head}>
            <Text style={s.name} numberOfLines={2}>{quote.number != null ? `#${quote.number} · ` : ''}{quote.name}</Text>
            <View style={s.chip}><Text style={s.chipText}>{quote.size}</Text></View>
          </View>
          {quote.lineType ? <Text style={s.sub}>{quote.lineType}</Text> : null}
          {quote.legs.map((leg) => {
            const plan = leg.savedMin ?? leg.estimatedMin;
            // Offered with 3+ trips when it would change the plan; never on a duty line, whose length is the duty, not the drive.
            const actual5 = leg.actualAvgMin != null ? Math.round(leg.actualAvgMin / 5) * 5 : null;
            const offerActual = actual5 != null && leg.trips >= 3 && actual5 !== plan && leg.estimateSource !== 'duty';
            return (
              <View key={leg.key} style={s.leg}>
                <Text style={s.route}>
                  {`${niceName(leg.from)} → ${niceName(leg.to)}`}
                  {leg.leg === 'return' ? <Text style={s.muted}>{' · return'}</Text> : null}
                  {leg.via ? <Text style={s.muted}>{` · ${leg.via} stop${leg.via === 1 ? '' : 's'} between`}</Text> : null}
                </Text>
                <View style={s.nums}>
                  <Num label="Estimate" value={hm(leg.estimatedMin)} sub={leg.estimateSource ? SOURCE[leg.estimateSource] : 'place not located'} struck={leg.savedMin != null} />
                  <Num label="Planned" value={hm(plan)} sub={leg.savedMin != null ? 'set by hand' : 'the estimate'} strong />
                  <Num label="Actual avg" value={hm(leg.actualAvgMin)} sub={leg.trips ? `${leg.trips} trip${leg.trips === 1 ? '' : 's'}, 90 days` : 'no trips yet'} />
                </View>
                {canSet ? (
                  <View style={[s.actions, busy === leg.key && { opacity: 0.5 }]} pointerEvents={busy ? 'none' : 'auto'}>
                    <TouchableOpacity style={s.btn} onPress={() => { tap(); setEditing(leg); }} accessibilityRole="button" accessibilityLabel={`Set the transit time for ${leg.from} to ${leg.to}`}>
                      <SquarePen size={14} color={INK} strokeWidth={2.4} />
                      <Text style={s.btnText}>Set time</Text>
                    </TouchableOpacity>
                    {offerActual ? (
                      <TouchableOpacity style={s.btn} onPress={() => { tap(); save(leg, actual5!); }} accessibilityRole="button">
                        <Text style={s.btnText}>Use actual {hm(actual5)}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {leg.savedMin != null ? (
                      <TouchableOpacity style={s.btn} onPress={() => { tap(); reset(leg); }} accessibilityRole="button">
                        <RotateCcw size={14} color={INK} strokeWidth={2.4} />
                        <Text style={s.btnText}>Use estimate</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      ))}
      <Text style={s.note}>Planned is what Create trip uses for new trips. Trips already created keep their own times.</Text>

      <TransitSheet
        visible={editing != null}
        title={editing ? `${niceName(editing.from)} → ${niceName(editing.to)} · ${editing.size}` : 'Transit time'}
        value={editing ? editing.savedMin ?? editing.estimatedMin : null}
        arrivalText={(m) => (editing?.estimatedMin != null ? `Estimate ${hm(editing.estimatedMin)} · new trips plan ${hm(m)}` : `New trips plan ${hm(m)}`)}
        onDone={(m) => editing && save(editing, m)}
        onClose={() => setEditing(null)}
      />
      <Toast visible={Boolean(toast)} message={toast?.text ?? ''} type={toast?.error ? 'error' : 'success'} onDismiss={() => setToast(null)} />
    </View>
  );
}

function Num({ label, value, sub, strong, struck }: { label: string; value: string; sub: string; strong?: boolean; struck?: boolean }) {
  return (
    <View style={s.num}>
      <Text style={s.numLabel}>{label}</Text>
      <Text style={[s.numValue, strong && { color: '#1F4FD1' }, struck && s.struck]}>{value}</Text>
      <Text style={s.numSub} numberOfLines={2}>{sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '800', color: INK },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#F1F1F3' },
  chipText: { fontSize: 11, fontWeight: '800', color: INK },
  sub: { fontSize: 12, fontWeight: '600', color: MUTED, marginTop: -6 },
  leg: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EFEFF2' },
  route: { fontSize: 14, fontWeight: '800', color: INK },
  muted: { fontWeight: '600', color: MUTED },
  nums: { flexDirection: 'row', gap: 10 },
  num: { flex: 1, gap: 2 },
  numLabel: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  numValue: { fontSize: 16, fontWeight: '800', color: INK },
  numSub: { fontSize: 11, color: MUTED, fontWeight: '600' },
  struck: { textDecorationLine: 'line-through', color: MUTED },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F1F1F3' },
  btnText: { fontSize: 13, fontWeight: '800', color: INK },
  note: { fontSize: 12, color: MUTED },
});
