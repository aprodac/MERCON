/**
 * Route: /transit-route — one route of a customer: planned vs actual average,
 * the slowest 1 in 10, where the time goes, and (Admin/Operator) "Use <actual>
 * as the planned time for new trips".
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { EmptyState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { PageTitle } from '@/components/pageCues';
import { operatorService } from '../../lib/operator';
import { Card, INK, MUTED, PAGE, tap } from '../trips/details/components/parts';
import { niceName } from '../trips/create/components/ui';
import { TONE, hm, overText } from './transitModel';

const PART_LABEL = { loading: 'Loading at pickup', road: 'On the road', offload: 'Waiting / offloading' } as const;

export default function TransitRouteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const { customerId, routeKey, days } = useLocalSearchParams<{ customerId: string; customerName?: string; routeKey: string; days?: string }>();
  const cid = String(customerId ?? '');
  const key = String(routeKey ?? '');
  const period = Number(days) || 30;
  const q = useQuery({ queryKey: ['transit', cid, 'route', key, period], queryFn: () => operatorService.transitRoute(cid, key, period), enabled: !!cid && !!key });
  const d = q.data;
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const canSet = role === 'Admin' || role === 'Operator';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customers'));

  const save = async () => {
    if (!d || d.suggestedMin == null) return;
    setSaving(true);
    try {
      await operatorService.setPlannedTransit(cid, d.key, d.suggestedMin);
      setConfirm(false);
      setToast('Saved — new trips will plan with it');
      await queryClient.invalidateQueries({ queryKey: ['transit', cid] });
    } catch {
      setToast('Couldn’t save the planned time');
    } finally {
      setSaving(false);
    }
  };

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
      <ScrollView contentContainerStyle={s.body}>
        {q.isLoading ? <SkeletonBlock height={220} radius={16} /> : !d ? (
          <EmptyState title="Couldn’t load this route" subtitle="Go back and try again." />
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <Text style={s.title}>{route}{d.leg === 'return' ? <Text style={s.ret}>{' · return'}</Text> : null}</Text>
              <Text style={s.sub}>{d.size} · last {d.days} days · {d.trips} {d.trips === 1 ? 'trip' : 'trips'}</Text>
            </View>

            <Card style={s.stats}>
              <Stat label={d.plannedSaved ? 'Planned (saved)' : 'Planned'} value={hm(d.plannedMin)} />
              <Stat label="Actual avg" value={hm(d.actualAvgMin)} color={tone?.fg} bg={tone?.bg} sub={overText(d.actualAvgMin, d.plannedMin)} />
              <Stat label="Slowest 1 in 10" value={hm(d.p90Min)} />
            </Card>

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
            ) : <EmptyState title="No trips yet" subtitle="Nobody has driven this route in the last days." />}

            {canSet && d.canUseActual && d.suggestedMin != null ? (
              <TouchableOpacity style={s.use} onPress={() => { tap(); setConfirm(true); }} activeOpacity={0.85} accessibilityRole="button">
                <Text style={s.useText}>{`Use ${hm(d.suggestedMin)} as the planned time for new trips`}</Text>
              </TouchableOpacity>
            ) : null}

            {d.recent.length ? (
              <Card style={{ padding: 14, gap: 8 }}>
                <Text style={s.h}>Recent trips</Text>
                {d.recent.map((t) => (
                  <TouchableOpacity key={t.tripId} style={s.recent} onPress={() => router.push({ pathname: '/trip-details', params: { id: t.tripId } })} accessibilityRole="button">
                    <Text style={s.recentRef}>{t.ref ?? 'Trip'}</Text>
                    <Text style={s.recentTime}>{new Date(t.departedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
                    <Text style={s.recentVal}>{hm(t.actualMin)}</Text>
                  </TouchableOpacity>
                ))}
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>

      <AppModal visible={confirm} onClose={() => !saving && setConfirm(false)} type="bottom-sheet" title="Use the actual time?">
        <View style={{ gap: 16, paddingBottom: 12 }}>
          <Text style={s.confirm}>
            {d ? `New trips on ${route} ${d.size} will plan ${hm(d.suggestedMin)} instead of ${hm(d.plannedMin)}. Existing trips don’t change.` : ''}
          </Text>
          <View style={s.actions}>
            <TouchableOpacity style={s.cancel} onPress={() => setConfirm(false)} disabled={saving}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={s.ok} onPress={save} disabled={saving} accessibilityRole="button">
              {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={s.okText}>Use {d ? hm(d.suggestedMin) : ''}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </AppModal>
      <Toast visible={Boolean(toast)} message={toast ?? ""} type="success" onDismiss={() => setToast(null)} />
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
  title: { fontSize: 20, fontWeight: '800', color: INK },
  ret: { fontWeight: '600', color: MUTED },
  sub: { fontSize: 13, fontWeight: '600', color: MUTED },
  stats: { flexDirection: 'row', padding: 14, gap: 10 },
  stat: { flex: 1, gap: 4 },
  statLabel: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  statPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: -8 },
  statValue: { fontSize: 20, fontWeight: '800', color: INK },
  statSub: { fontSize: 12, fontWeight: '700', color: MUTED },
  h: { fontSize: 15, fontWeight: '800', color: INK },
  partRow: { flexDirection: 'row', justifyContent: 'space-between' },
  partLabel: { fontSize: 13, fontWeight: '600', color: MUTED },
  partValue: { fontSize: 13, fontWeight: '700', color: INK },
  partBig: { color: '#B42318', fontWeight: '800' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#EEF0F3', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#B8BCC6' },
  fillBig: { backgroundColor: '#E5484D' },
  use: { backgroundColor: INK, borderRadius: 14, paddingVertical: 15, alignItems: 'center', paddingHorizontal: 14 },
  useText: { color: Colors.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  recentRef: { flex: 1, fontSize: 14, fontWeight: '700', color: INK },
  recentTime: { fontSize: 13, color: MUTED },
  recentVal: { fontSize: 14, fontWeight: '800', color: INK, minWidth: 64, textAlign: 'right' },
  confirm: { fontSize: 15, lineHeight: 22, color: INK },
  actions: { flexDirection: 'row', gap: 10 },
  cancel: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#F1F1F3' },
  cancelText: { fontWeight: '800', color: INK },
  ok: { flex: 1.4, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: INK },
  okText: { fontWeight: '800', color: Colors.white },
});
