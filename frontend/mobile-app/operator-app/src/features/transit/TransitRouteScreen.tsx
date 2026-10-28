/**
 * Route: /transit-route — one route of a customer: planned vs actual average,
 * the slowest 1 in 10, where the time goes, and (Admin/Operator) "Use <actual>
 * as the planned time for new trips", a time set by hand, or back to the estimate.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, RotateCcw, SquarePen } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { EmptyState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { PageTitle } from '@/components/pageCues';
import { operatorService } from '../../lib/operator';
import { Card, INK, MUTED, PAGE, tap } from '../trips/details/components/parts';
import { niceName } from '../trips/create/components/ui';
import { TransitSheet } from '../trips/create/components/TransitSheet';
import { PERIOD_OPTIONS, TONE, hm, overText, toneFor } from './transitModel';

const PART_LABEL = { loading: 'Loading at pickup', road: 'Pickup → drop-off', offload: 'Waiting / offloading' } as const;

type Confirm = { kind: 'actual' } | { kind: 'clear' } | null;

export default function TransitRouteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const { customerId, routeKey, days } = useLocalSearchParams<{ customerId: string; customerName?: string; routeKey: string; days?: string }>();
  const cid = String(customerId ?? '');
  const key = String(routeKey ?? '');
  const [period, setPeriod] = useState<number>(Number(days) || 30);
  const q = useQuery({
    queryKey: ['transit', cid, 'route', key, period],
    queryFn: () => operatorService.transitRoute(cid, key, period),
    enabled: !!cid && !!key,
    placeholderData: keepPreviousData,
    retry: (n, err: any) => err?.response?.status !== 404 && n < 2,
  });
  const d = q.data;
  const notFound = (q.error as any)?.response?.status === 404;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const canSet = role === 'Admin' || role === 'Operator';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customers'));

  const run = async (work: () => Promise<void>, ok: string, fail: string) => {
    setSaving(true);
    try {
      await work();
      setConfirm(null);
      setToast({ text: ok });
      await queryClient.invalidateQueries({ queryKey: ['transit', cid] });
    } catch {
      setToast({ text: fail, error: true });
    } finally {
      setSaving(false);
    }
  };
  const applyActual = () => d?.suggestedMin != null && run(() => operatorService.setPlannedTransit(cid, d.key, d.suggestedMin!), 'Saved — new trips will plan with it', 'Couldn’t save the planned time');
  const setByHand = (min: number) => {
    setEditing(false);
    if (d) run(() => operatorService.setPlannedTransit(cid, d.key, min), `New trips will plan ${hm(min)}`, 'Couldn’t save the planned time');
  };
  const clearSaved = () => d && run(() => operatorService.clearPlannedTransit(cid, d.key), 'Back to the estimate for new trips', 'Couldn’t reset the time');

  const tone = d?.tone ? TONE[d.tone] : null;
  const route = d ? `${niceName(d.from)} → ${niceName(d.to)}` : '';
  const parts = d ? ([['loading', d.time.loadingMin], ['road', d.time.roadMin], ['offload', d.time.offloadMin]] as const) : [];
  const total = parts.reduce((a, [, m]) => a + (m ?? 0), 0);

  return (
    <View style={s.page}>
      <View style={[s.bar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity style={s.barBtn} onPress={back} accessibilityLabel="Back"><ArrowLeft size={20} color={INK} strokeWidth={2.4} /></TouchableOpacity>
        <PageTitle title="Route" />
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isPlaceholderData} onRefresh={() => q.refetch()} />}>
        <View style={s.period}>
          {PERIOD_OPTIONS.map((p) => (
            <TouchableOpacity key={p} style={[s.periodItem, period === p && s.periodOn]} onPress={() => { tap(); setPeriod(p); }} accessibilityRole="button" accessibilityState={{ selected: period === p }}>
              <Text style={[s.periodText, period === p && s.periodTextOn]}>{`${p} days`}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {q.isLoading ? <View style={{ gap: 12 }}><SkeletonBlock height={60} radius={12} /><SkeletonBlock height={110} radius={16} /><SkeletonBlock height={160} radius={16} /></View> : !d || (q.isError && !q.isPlaceholderData) ? (
          <View style={{ alignItems: 'center' }}>
            <EmptyState
              title={notFound ? `No trips on this route in the last ${period} days` : 'Couldn’t load this route'}
              subtitle={notFound ? (period < 90 ? 'Try a longer period.' : 'Nobody drove it lately and no time is saved for it.') : 'Check the connection and try again.'}
            />
            {!notFound ? <TouchableOpacity style={s.retry} onPress={() => { tap(); q.refetch(); }}><Text style={s.retryText}>Try again</Text></TouchableOpacity> : null}
          </View>
        ) : (
          <View style={{ gap: 12, opacity: q.isPlaceholderData ? 0.6 : 1 }}>
            <View style={{ gap: 6 }}>
              <Text style={s.title}>{route}</Text>
              <View style={s.tags}>
                <View style={s.tag}><Text style={s.tagStrong}>{d.size}</Text></View>
                {d.leg === 'return' ? <View style={s.tag}><Text style={s.tagText}>Way back</Text></View> : null}
                <View style={s.tag}><Text style={s.tagText}>{`${d.trips} ${d.trips === 1 ? 'trip' : 'trips'} · ${d.days} days`}</Text></View>
                {q.isFetching && q.isPlaceholderData ? <ActivityIndicator size="small" color={MUTED} /> : null}
              </View>
            </View>

            <Card style={s.stats}>
              <Stat label="Planned" value={hm(d.plannedMin)} sub={d.plannedSaved ? 'saved time' : 'as booked'} />
              <Stat label="Actual avg" value={hm(d.actualAvgMin)} color={tone?.fg} bg={tone?.bg} sub={overText(d.actualAvgMin, d.plannedMin) || (d.trips ? '' : 'no trips')} />
              <Stat label="Slowest 1 in 10" value={hm(d.p90Min)} />
            </Card>

            {canSet ? (
              <Card style={{ padding: 14, gap: 10 }}>
                <Text style={s.h}>New trips on this route</Text>
                <Text style={s.explain}>
                  {d.plannedSaved
                    ? `Create trip plans ${hm(d.plannedMin)} (saved). Trips already created keep their own times.`
                    : 'Create trip plans with its road estimate (or the duty length). Save a time to plan with it instead.'}
                </Text>
                {d.canUseActual && d.suggestedMin != null ? (
                  <TouchableOpacity style={s.use} onPress={() => { tap(); setConfirm({ kind: 'actual' }); }} activeOpacity={0.85} accessibilityRole="button" disabled={saving}>
                    <Text style={s.useText}>{`Use ${hm(d.suggestedMin)} (actual average)`}</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={s.actions}>
                  <TouchableOpacity style={s.soft} onPress={() => { tap(); setEditing(true); }} disabled={saving} accessibilityRole="button">
                    <SquarePen size={14} color={INK} strokeWidth={2.4} />
                    <Text style={s.softText}>Set time</Text>
                  </TouchableOpacity>
                  {d.plannedSaved ? (
                    <TouchableOpacity style={s.soft} onPress={() => { tap(); setConfirm({ kind: 'clear' }); }} disabled={saving} accessibilityRole="button">
                      <RotateCcw size={14} color={INK} strokeWidth={2.4} />
                      <Text style={s.softText}>Use estimate</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {!d.canUseActual && d.trips > 0 && d.trips < 3 ? <Text style={s.hint}>“Use actual” shows once 3 trips are finished on this route.</Text> : null}
              </Card>
            ) : null}

            {d.trips > 0 ? (
              <Card style={{ padding: 14, gap: 12 }}>
                <Text style={s.h}>Where the time goes</Text>
                {parts.map(([k, m]) => {
                  const big = d.time.biggest === k;
                  return (
                    <View key={k} style={{ gap: 5 }}>
                      <View style={s.partRow}>
                        <Text style={[s.partLabel, big && s.partBig]}>{PART_LABEL[k]}{big ? ' · biggest' : ''}</Text>
                        <Text style={[s.partValue, big && s.partBig]}>{m == null ? 'not recorded' : hm(m)}</Text>
                      </View>
                      <View style={s.track}><View style={[s.fill, big && s.fillBig, { width: `${total && m ? Math.max(3, Math.round((m / total) * 100)) : 0}%` }]} /></View>
                    </View>
                  );
                })}
              </Card>
            ) : null}

            {d.recent.length ? (
              <Card style={{ padding: 14, gap: 2 }}>
                <Text style={[s.h, { marginBottom: 6 }]}>Recent trips</Text>
                {d.recent.map((t, i) => {
                  const plan = d.plannedMin ?? t.plannedMin;
                  const tt = toneFor(t.actualMin, plan);
                  return (
                    <TouchableOpacity
                      key={t.tripId}
                      style={[s.recent, i > 0 && s.recentLine]}
                      onPress={() => { tap(); router.push({ pathname: '/trip-details', params: { id: t.tripId } }); }}
                      accessibilityRole="button"
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.recentRef}>{t.ref ?? 'Trip'}</Text>
                        <Text style={s.recentTime}>{new Date(t.departedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={[s.recentPill, tt && { backgroundColor: tt.bg }]}><Text style={[s.recentVal, tt && { color: tt.fg }]}>{hm(t.actualMin)}</Text></View>
                        {plan != null ? <Text style={[s.recentOver, tt && { color: tt.fg }]}>{overText(t.actualMin, plan)}</Text> : null}
                      </View>
                      <ChevronRight size={16} color={MUTED} />
                    </TouchableOpacity>
                  );
                })}
              </Card>
            ) : null}
          </View>
        )}
      </ScrollView>

      <AppModal visible={confirm != null} onClose={() => !saving && setConfirm(null)} type="bottom-sheet" title={confirm?.kind === 'clear' ? 'Go back to the estimate?' : 'Use the actual time?'}>
        <View style={{ gap: 16, paddingBottom: 12 }}>
          <Text style={s.confirm}>
            {!d ? '' : confirm?.kind === 'clear'
              ? `New trips on ${route} ${d.size} will plan with Create trip’s estimate instead of ${hm(d.plannedMin)}. Existing trips don’t change.`
              : `New trips on ${route} ${d.size} will plan ${hm(d.suggestedMin)} instead of ${hm(d.plannedMin)}. Existing trips don’t change.`}
          </Text>
          <View style={s.actions}>
            <TouchableOpacity style={s.cancel} onPress={() => setConfirm(null)} disabled={saving}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={s.ok} onPress={confirm?.kind === 'clear' ? clearSaved : applyActual} disabled={saving} accessibilityRole="button">
              {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={s.okText}>{confirm?.kind === 'clear' ? 'Use estimate' : `Use ${d ? hm(d.suggestedMin) : ''}`}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </AppModal>
      <TransitSheet
        visible={editing}
        title={d ? `${route} · ${d.size}` : 'Transit time'}
        value={d?.plannedMin ?? d?.suggestedMin ?? null}
        arrivalText={(m) => (d?.actualAvgMin != null ? `Actual avg ${hm(d.actualAvgMin)} · new trips plan ${hm(m)}` : `New trips plan ${hm(m)}`)}
        onDone={setByHand}
        onClose={() => setEditing(false)}
      />
      <Toast visible={Boolean(toast)} message={toast?.text ?? ''} type={toast?.error ? 'error' : 'success'} onDismiss={() => setToast(null)} />
    </View>
  );
}

function Stat({ label, value, sub, color, bg }: { label: string; value: string; sub?: string; color?: string; bg?: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <View style={[s.statPill, bg ? { backgroundColor: bg } : null]}><Text style={[s.statValue, color ? { color } : null]}>{value}</Text></View>
      {sub ? <Text style={[s.statSub, color ? { color } : null]}>{sub}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E9EC' },
  body: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  period: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: '#E9E9EC' },
  periodItem: { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  periodOn: { backgroundColor: '#EEF1FB' },
  periodText: { fontSize: 13, fontWeight: '700', color: MUTED },
  periodTextOn: { color: '#1F4FD1', fontWeight: '800' },
  retry: { backgroundColor: INK, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: Colors.white, fontWeight: '800' },
  title: { fontSize: 20, fontWeight: '800', color: INK },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#ECECEF' },
  tagStrong: { fontSize: 12, fontWeight: '800', color: INK },
  tagText: { fontSize: 12, fontWeight: '700', color: MUTED },
  stats: { flexDirection: 'row', padding: 14, gap: 10 },
  stat: { flex: 1, gap: 4 },
  statLabel: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  statPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: -8 },
  statValue: { fontSize: 20, fontWeight: '800', color: INK },
  statSub: { fontSize: 12, fontWeight: '700', color: MUTED },
  h: { fontSize: 15, fontWeight: '800', color: INK },
  explain: { fontSize: 13, lineHeight: 19, color: MUTED, fontWeight: '600' },
  hint: { fontSize: 12, color: MUTED },
  partRow: { flexDirection: 'row', justifyContent: 'space-between' },
  partLabel: { fontSize: 13, fontWeight: '600', color: MUTED },
  partValue: { fontSize: 13, fontWeight: '700', color: INK },
  partBig: { color: '#B42318', fontWeight: '800' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#EEF0F3', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#B8BCC6' },
  fillBig: { backgroundColor: '#E5484D' },
  use: { backgroundColor: INK, borderRadius: 14, paddingVertical: 14, alignItems: 'center', paddingHorizontal: 14 },
  useText: { color: Colors.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  soft: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: '#F1F1F3' },
  softText: { fontSize: 13, fontWeight: '800', color: INK },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  recentLine: { borderTopWidth: 1, borderTopColor: '#F0F0F2' },
  recentRef: { fontSize: 14, fontWeight: '700', color: INK },
  recentTime: { fontSize: 12, color: MUTED, marginTop: 1 },
  recentPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: '#F1F1F3' },
  recentVal: { fontSize: 14, fontWeight: '800', color: INK },
  recentOver: { fontSize: 11, fontWeight: '700', color: MUTED, marginTop: 2 },
  confirm: { fontSize: 15, lineHeight: 22, color: INK },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cancel: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#F1F1F3' },
  cancelText: { fontWeight: '800', color: INK },
  ok: { flex: 1.4, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: INK },
  okText: { fontWeight: '800', color: Colors.white },
});
