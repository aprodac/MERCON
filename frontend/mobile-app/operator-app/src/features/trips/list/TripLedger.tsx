/**
 * Trips → Ledger: every trip in trip-number order, like a register — how many
 * trips there are, each trip's number, day, customer and route, truck, status
 * and price, with the deleted ones in place (struck through) so the numbers run
 * without unexplained gaps. A month at a time (by planned day), or all time.
 * Owner request 22 Oct: "a view where we can see all trips and the trip ID count,
 * like a ledger" — and select several and delete them ("Select", or long-press
 * a row), with the app's usual rule: not running, not invoiced (canDeleteTrip).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { api, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import type { OperatorTrip } from '../../../lib/operator';
import { PHASE_STYLE, phaseOf, plateOf, routeOf, statusText, type TimeFmt } from './tripListModel';
import { canDeleteTrip, deleteTrips } from '../edit/movePlan';

const INK = '#3E3C3D';
const MUTED = '#6E6E80';

/** A deleted trip as the Recycle Bin sends it (GET /trash, trips carry `trip`). */
interface DeletedRow {
  id: string;
  name: string;
  deletedAt: string;
  trip?: { customer: string | null; from: string | null; to: string | null; round: boolean; plate: string | null; planned_start: string | null };
}

interface Row {
  key: string;
  /** 41 for TRP-0041; null for a trip without a number (draft). */
  no: number | null;
  ref: string;
  day: string | null;
  customer: string;
  route: string;
  plate: string | null;
  status: string;
  tone: { bg: string; fg: string };
  amount: number | null;
  deleted: boolean;
  trip: OperatorTrip | null;
}

/**
 * 41 for "TRP-0041" and "TRP-DEL-0041"; a trip deleted twice under one number
 * gets a suffix ("TRP-DEL-0042-3b3af753"), which isn't part of the number.
 */
const numberOf = (ref?: string | null) => {
  const m = /^[A-Z]+-(?:DEL-)?(\d+)/i.exec(ref ?? '') ?? /(\d+)\s*$/.exec(ref ?? '');
  return m ? Number(m[1]) : null;
};
/** "TRP-DEL-0042-3b3af753" → "TRP-0042". */
const liveRef = (name: string) => name.replace(/-DEL-/i, '-').replace(/^([A-Z]+-\d+)-[0-9a-f]{4,}$/i, '$1');
const DELETED_TONE = { bg: '#F1F1F3', fg: '#9898A4' };

export function TripLedger({ f, todayKey, scope, onOpen }: {
  f: TimeFmt;
  todayKey: string;
  /** One truck or customer only (opened from their page). */
  scope?: Record<string, string>;
  onOpen: (t: OperatorTrip) => void;
}) {
  /** 0 = this month, 1 = last month …; null = all time. */
  const [back, setBack] = useState<number | null>(0);
  const queryClient = useQueryClient();
  /** Select mode: the trip ids picked for deleting. null = not selecting. */
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [y, m] = todayKey.split('-').map(Number);
  const first = back === null ? null : new Date(Date.UTC(y, m - 1 - back, 1));
  const monthKey = first ? first.toISOString().slice(0, 7) : 'all';
  const range = useMemo(() => {
    if (!first) return null;
    const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    return { from: f.startOfDay(first.toISOString().slice(0, 10)), to: new Date(f.startOfDay(next.toISOString().slice(0, 10)).getTime() - 1) };
  }, [f, monthKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const scopeKey = scope ? Object.entries(scope).map(([k, v]) => `${k}=${v}`).join('&') : 'all';
  const trips = useQuery({
    queryKey: ['trips', 'ledger', monthKey, scopeKey],
    queryFn: async () => {
      const params: Record<string, string | number> = { per_page: 5000, ...(scope ?? {}) };
      if (range) { params.start_date = range.from.toISOString(); params.end_date = range.to.toISOString(); }
      const { data } = await api.get('/trips', { params });
      return (data.data ?? []) as OperatorTrip[];
    },
  });
  // Deleted trips keep their number in the ledger (the Recycle Bin's list); not when scoped to one truck / customer.
  const deleted = useQuery({
    queryKey: ['trips', 'ledger', 'deleted'],
    queryFn: async () => ((await api.get('/trash')).data?.data ?? []).filter((it: { type: string }) => it.type === 'Trip') as DeletedRow[],
    enabled: !scope,
    retry: false,
  });

  const rows = useMemo<Row[]>(() => {
    const live: Row[] = (trips.data ?? []).map((t) => {
      const r = routeOf(t);
      const ph = PHASE_STYLE[phaseOf(t.status)];
      return {
        key: t.id,
        no: numberOf(t.ref_id),
        ref: t.ref_id ?? 'Draft',
        day: t.planned_start ?? t.createdAt ?? null,
        customer: t.customer?.name ?? '—',
        route: r.from === '—' ? '—' : `${r.from} → ${r.to}${r.back ? ' · round' : ''}`,
        plate: plateOf(t),
        status: statusText(t),
        tone: t.status === 'Invoiced' ? { bg: '#E7EEFC', fg: '#2449A8' } : { bg: ph.bg, fg: ph.fg },
        amount: t.billing_amount != null ? Number(t.billing_amount) : null,
        deleted: false,
        trip: t,
      };
    });
    const inRange = (iso: string | null | undefined) => {
      if (!range) return true;
      if (!iso) return false;
      const ms = Date.parse(iso);
      return ms >= range.from.getTime() && ms <= range.to.getTime();
    };
    const gone: Row[] = scope ? [] : (deleted.data ?? [])
      .filter((d) => inRange(d.trip?.planned_start ?? d.deletedAt))
      .map((d) => ({
        key: d.id,
        no: numberOf(d.name),
        ref: liveRef(d.name),
        day: d.trip?.planned_start ?? null,
        customer: d.trip?.customer ?? '—',
        route: d.trip?.from || d.trip?.to ? `${d.trip?.from ?? '?'} → ${d.trip?.to ?? '?'}${d.trip?.round ? ' · round' : ''}` : '—',
        plate: d.trip?.plate ?? null,
        status: 'Deleted',
        tone: DELETED_TONE,
        amount: null,
        deleted: true,
        trip: null,
      }));
    return [...live, ...gone].sort((a, b) => (a.no ?? Infinity) - (b.no ?? Infinity) || a.ref.localeCompare(b.ref));
  }, [trips.data, deleted.data, range, scope]);

  const counts = useMemo(() => {
    const c = new Map<string, { n: number; tone: Row['tone'] }>();
    for (const r of rows) {
      const k = r.deleted ? 'Deleted' : r.status === 'Starting late' || r.status === 'Late arriving' ? 'Delayed' : r.status;
      c.set(k, { n: (c.get(k)?.n ?? 0) + 1, tone: r.tone });
    }
    return [...c.entries()];
  }, [rows]);
  const live = rows.filter((r) => !r.deleted);
  const billed = live.filter((r) => r.trip?.status !== 'Cancelled').reduce((n, r) => n + (r.amount ?? 0), 0);
  const nums = rows.map((r) => r.no).filter((n): n is number => n != null);
  const lo = nums.length ? Math.min(...nums) : null;
  const hi = nums.length ? Math.max(...nums) : null;
  // In all time, numbers between the first and last that no trip has (not even a deleted one).
  const missing = back === null && lo != null && hi != null ? hi - lo + 1 - new Set(nums).size : 0;
  const pad = (n: number) => `TRP-${String(n).padStart(4, '0')}`;
  const title = first ? first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'All time';

  const deletable = (r: Row) => !!r.trip && canDeleteTrip(r.trip.status);
  const selectable = rows.filter(deletable);
  const toggle = (r: Row) => {
    if (!picked) return;
    if (!deletable(r)) {
      Alert.alert(r.ref, r.deleted ? 'Already deleted — restore it from the Recycle bin.' : `${r.status} trips can't be deleted. Cancel a running trip first; invoiced trips stay.`);
      return;
    }
    const next = new Set(picked);
    if (next.has(r.key)) next.delete(r.key); else next.add(r.key);
    setPicked(next);
  };
  const allPicked = !!picked && selectable.length > 0 && selectable.every((r) => picked.has(r.key));
  const removePicked = () => {
    if (!picked?.size) return;
    const ids = [...picked];
    const refs = rows.filter((r) => picked.has(r.key)).map((r) => r.ref);
    Alert.alert(
      `Delete ${ids.length} trip${ids.length === 1 ? '' : 's'}?`,
      `${refs.slice(0, 8).join(', ')}${refs.length > 8 ? ` +${refs.length - 8} more` : ''}\n\nThey disappear from the trip lists, the driver app and the customer link. Admins can restore them from the Recycle bin.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setDeleting(true);
            try {
              const r = await deleteTrips(ids);
              if (r.kept.length) Alert.alert(`Deleted ${r.deleted} of ${ids.length}`, `Kept because they are invoiced or paid: ${r.kept.join(', ')}`);
              setPicked(null);
              await queryClient.invalidateQueries({ queryKey: ['trips'] });
            } catch (e) {
              Alert.alert('Could not delete', getApiErrorMessage(e));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const header = (
    <View style={{ gap: 10, marginBottom: 8 }}>
      <View style={s.periodRow}>
        <TouchableOpacity style={s.step} onPress={() => setBack((b) => (b === null ? 0 : Math.min(b + 1, 35)))} accessibilityLabel="Previous month" hitSlop={8}>
          <ChevronLeft size={18} color={INK} />
        </TouchableOpacity>
        <Text style={s.period}>{title}</Text>
        <TouchableOpacity style={[s.step, (back === 0 || back === null) && s.off]} disabled={back === 0 || back === null} onPress={() => setBack((b) => Math.max((b ?? 1) - 1, 0))} accessibilityLabel="Next month" hitSlop={8}>
          <ChevronRight size={18} color={INK} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={[s.allBtn, back === null && s.allOn]} onPress={() => setBack((b) => (b === null ? 0 : null))} accessibilityRole="button">
          <Text style={[s.allText, back === null && { color: '#fff' }]}>All time</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.allBtn, picked && s.allOn]} onPress={() => setPicked((p) => (p ? null : new Set()))} accessibilityRole="button">
          <Text style={[s.allText, picked && { color: '#fff' }]}>{picked ? 'Done' : 'Select'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.summary}>
        <View style={s.sumTop}>
          <View>
            <Text style={s.bigNum}>{live.length}</Text>
            <Text style={s.bigLabel}>{live.length === 1 ? 'trip' : 'trips'}{rows.length > live.length ? ` · ${rows.length - live.length} deleted` : ''}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.range}>{lo != null && hi != null ? `${pad(lo)} → ${pad(hi)}` : '—'}</Text>
            {billed > 0 ? <Text style={s.bigLabel}>{`SAR ${Math.round(billed).toLocaleString('en-US')} billed`}</Text> : null}
            {missing > 0 ? <Text style={[s.bigLabel, { color: '#B54708' }]}>{`${missing} number${missing === 1 ? '' : 's'} not used`}</Text> : null}
          </View>
        </View>
        <View style={s.chips}>
          {counts.map(([label, c]) => (
            <View key={label} style={[s.chip, { backgroundColor: c.tone.bg }]}>
              <Text style={[s.chipText, { color: c.tone.fg }]}>{`${label} ${c.n}`}</Text>
            </View>
          ))}
        </View>
      </View>

      {picked ? (
        <TouchableOpacity style={s.selAll} onPress={() => setPicked(allPicked ? new Set() : new Set(selectable.map((r) => r.key)))} accessibilityRole="button">
          <Box on={allPicked} />
          <Text style={s.selAllText}>{allPicked ? 'Clear selection' : `Select all that can be deleted (${selectable.length})`}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={s.headRow}>
        {picked ? <View style={{ width: 22 }} /> : null}
        <Text style={[s.h, s.cNo]}>No.</Text>
        <Text style={[s.h, { flex: 1 }]}>Customer · route</Text>
        <Text style={[s.h, s.cAmt]}>SAR</Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      contentContainerStyle={s.list}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={trips.isRefetching} onRefresh={() => { void trips.refetch(); void deleted.refetch(); }} tintColor={Colors.primary} />}
      renderItem={({ item: r, index }) => (
        <TouchableOpacity
          style={[s.row, index % 2 === 1 && s.rowAlt, index === 0 && s.rowFirst, index === rows.length - 1 && s.rowLast]}
          disabled={!r.trip && !picked}
          onPress={() => (picked ? toggle(r) : r.trip && onOpen(r.trip))}
          onLongPress={() => { if (!picked && deletable(r)) setPicked(new Set([r.key])); }}
          activeOpacity={0.7}
          accessibilityLabel={`${r.ref}, ${r.customer}, ${r.status}`}
          accessibilityState={picked ? { checked: picked.has(r.key), disabled: !deletable(r) } : undefined}
        >
          {picked ? <View style={{ paddingTop: 2 }}><Box on={picked.has(r.key)} off={!deletable(r)} /></View> : null}
          <View style={s.cNo}>
            <Text style={[s.no, r.deleted && s.struck]}>{r.no != null ? String(r.no).padStart(4, '0') : '—'}</Text>
            <Text style={s.day}>{r.day ? f.day(r.day) : ''}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={[s.cust, r.deleted && s.struck]} numberOfLines={1}>{r.customer}</Text>
            <Text style={s.route} numberOfLines={1}>{[r.route, r.plate].filter(Boolean).join(' · ')}</Text>
            <View style={[s.status, { backgroundColor: r.tone.bg }]}>
              <Text style={[s.statusText, { color: r.tone.fg }]}>{r.status}</Text>
            </View>
          </View>
          <Text style={[s.amt, s.cAmt, (r.deleted || r.trip?.status === 'Cancelled') && s.struck]}>
            {r.amount != null ? Math.round(r.amount).toLocaleString('en-US') : '—'}
          </Text>
        </TouchableOpacity>
      )}
      ListEmptyComponent={trips.isLoading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 30 }} /> : <Text style={s.empty}>No trips in {title.toLowerCase() === 'all time' ? 'any month' : title}.</Text>}
    />
    {picked ? (
      <View style={s.bar}>
        <TouchableOpacity style={s.barCancel} onPress={() => setPicked(null)} accessibilityLabel="Stop selecting" hitSlop={6}>
          <X size={18} color={INK} />
        </TouchableOpacity>
        <Text style={s.barText}>{picked.size} selected</Text>
        <TouchableOpacity style={[s.barDelete, (!picked.size || deleting) && { opacity: 0.4 }]} disabled={!picked.size || deleting} onPress={removePicked} accessibilityRole="button">
          {deleting ? <ActivityIndicator color="#fff" /> : <Trash2 size={17} color="#fff" />}
          <Text style={s.barDeleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    ) : null}
    </View>
  );
}

function Box({ on, off }: { on: boolean; off?: boolean }) {
  return (
    <View style={[s.box, on && s.boxOn, off && s.boxOff]}>
      {on ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 200 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  period: { fontSize: 16, fontWeight: '800', color: INK },
  allBtn: { paddingHorizontal: 12, height: 32, borderRadius: 999, backgroundColor: '#fff', justifyContent: 'center' },
  allOn: { backgroundColor: INK },
  allText: { fontSize: 13, fontWeight: '700', color: INK },
  summary: { backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 10 },
  sumTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bigNum: { fontSize: 30, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  bigLabel: { fontSize: 12.5, fontWeight: '600', color: MUTED },
  range: { fontSize: 14, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: '700' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, marginTop: 4 },
  h: { fontSize: 11, fontWeight: '800', color: MUTED, letterSpacing: 0.4, textTransform: 'uppercase' },
  cNo: { width: 74 },
  cAmt: { width: 64, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10 },
  rowAlt: { backgroundColor: '#FAFAFB' },
  rowFirst: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  rowLast: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  no: { fontSize: 16, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  day: { fontSize: 11, color: MUTED, marginTop: 1 },
  cust: { fontSize: 14, fontWeight: '700', color: INK },
  route: { fontSize: 12, color: MUTED },
  status: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginTop: 2 },
  statusText: { fontSize: 11, fontWeight: '700' },
  amt: { fontSize: 14, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  struck: { textDecorationLine: 'line-through', color: '#A1A1AA' },
  selAll: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 4 },
  selAllText: { fontSize: 14, fontWeight: '700', color: INK },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#B8BCC8', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  boxOff: { backgroundColor: '#F1F1F3', borderColor: '#E4E4E7' },
  bar: { position: 'absolute', left: 16, right: 16, bottom: 110, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 18, padding: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  barCancel: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F1F3F7', alignItems: 'center', justifyContent: 'center' },
  barText: { flex: 1, fontSize: 15, fontWeight: '800', color: INK },
  barDelete: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D92D20', borderRadius: 12, paddingHorizontal: 16, height: 40 },
  barDeleteText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  empty: { textAlign: 'center', color: MUTED, marginTop: 30, fontSize: 14 },
});
