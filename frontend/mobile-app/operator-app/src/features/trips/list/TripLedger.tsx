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
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Alert, ScrollView, TextInput } from 'react-native';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowDownUp, ArrowUp, Building2, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDot, Clock3, Search, Trash2, Truck, UserRound, X, type LucideIcon } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { api, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import type { OperatorTrip } from '../../../lib/operator';
import { PHASE_STYLE, driverNameOf, phaseOf, plannedTransitMin, plateOf, routeOf, shortDuration, statusText, type TimeFmt } from './tripListModel';
import { COMPLETED_DELETE_WARNING, canDeleteTrip, deleteTrips } from '../edit/movePlan';

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
  driver: string | null;
  /** Planned transit time of the first leg, minutes. */
  tt: number | null;
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

export function TripLedger({ f, todayKey, scope, customer, onPickCustomer, onClearCustomer, onOpen }: {
  f: TimeFmt;
  todayKey: string;
  /** One truck or customer only (opened from their page, or picked here). */
  scope?: Record<string, string>;
  /** The customer the ledger is narrowed to, shown on its filter chip; null = all customers. */
  customer?: string | null;
  /** Customer filter (TestFlight 30 Oct: "ledger, customer filter option"). */
  onPickCustomer?: () => void;
  onClearCustomer?: () => void;
  onOpen: (t: OperatorTrip) => void;
}) {
  /** 0 = this month, 1 = last month …; null = all time. */
  const [back, setBack] = useState<number | null>(0);
  /** Trip number order: newest first by default (TestFlight 24 Oct: "show latest on top, keep a filter latest / oldest"). */
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  /** Sort by trip number or by loading day (TestFlight 30 Oct: "trips go 1 and 31 by date … filter date wise"). */
  const [sortBy, setSortBy] = useState<'no' | 'date'>('no');
  /** One loading day only (YYYY-MM-DD); null = the whole month. */
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const queryClient = useQueryClient();
  /** One status only ("Delivered", "On the road" …); null = every status. */
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'month' | 'status' | 'day' | 'sort' | null>(null);
  /** Search within the month shown (TestFlight 30 Oct: "keep the search bar also"). */
  const [query, setQuery] = useState('');
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
        driver: driverNameOf(t),
        tt: plannedTransitMin(t),
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
        driver: null,
        tt: null,
        status: 'Deleted',
        tone: DELETED_TONE,
        amount: null,
        deleted: true,
        trip: null,
      }));
    // By trip number (lowest or highest first); the live trip before deleted ones with the
    // same number; trips without a number (drafts) always last.
    const dir = order === 'asc' ? 1 : -1;
    if (sortBy === 'date') {
      const at = (r: Row) => (r.day ? Date.parse(r.day) : NaN);
      return [...live, ...gone].sort((a, b) => {
        const x = at(a), y = at(b);
        if (Number.isNaN(x) || Number.isNaN(y)) return Number.isNaN(x) && Number.isNaN(y) ? 0 : Number.isNaN(x) ? 1 : -1;
        return (x - y) * dir || (a.no ?? 0) - (b.no ?? 0);
      });
    }
    return [...live, ...gone].sort((a, b) => {
      if (a.no == null || b.no == null) return a.no == null && b.no == null ? a.ref.localeCompare(b.ref) : a.no == null ? 1 : -1;
      return (a.no - b.no) * dir || Number(a.deleted) - Number(b.deleted) || a.ref.localeCompare(b.ref);
    });
  }, [trips.data, deleted.data, range, scope, order, sortBy]);

  const statusKey = (r: Row) => (r.deleted ? 'Deleted' : r.status === 'Starting late' || r.status === 'Late arriving' ? 'Delayed' : r.status);
  const counts = useMemo(() => {
    const c = new Map<string, { n: number; tone: Row['tone'] }>();
    for (const r of rows) {
      const k = statusKey(r);
      c.set(k, { n: (c.get(k)?.n ?? 0) + 1, tone: r.tone });
    }
    return [...c.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [rows]);
  /** The rows the list shows: the search and status filters applied. The summary counts stay for the whole month. */
  const term = query.trim().toLowerCase();
  const dayOf = (r: Row) => (r.day ? f.dayKey(r.day) : null);
  const days = useMemo(() => {
    const c = new Map<string, { n: number; iso: string }>();
    for (const r of rows) { const k = dayOf(r); if (k && r.day) c.set(k, { n: (c.get(k)?.n ?? 0) + 1, iso: r.day }); }
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = rows.filter((r) => (!statusFilter || statusKey(r) === statusFilter) && (!dayFilter || dayOf(r) === dayFilter)
    && (!term || [r.ref, r.customer, r.route, r.plate, r.driver].some((v) => v?.toLowerCase().includes(term))));
  const live = rows.filter((r) => !r.deleted);
  const billed = live.filter((r) => r.trip?.status !== 'Cancelled').reduce((n, r) => n + (r.amount ?? 0), 0);
  const nums = rows.map((r) => r.no).filter((n): n is number => n != null);
  const lo = nums.length ? Math.min(...nums) : null;
  const hi = nums.length ? Math.max(...nums) : null;
  // In all time, numbers between the first and last that no trip has (not even a deleted one).
  const missing = back === null && lo != null && hi != null ? hi - lo + 1 - new Set(nums).size : 0;
  const pad = (n: number) => `TRP-${String(n).padStart(4, '0')}`;
  // Short month ("Oct 2026") so it stays on one line next to All time / Select.
  const title = first ? first.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'All time';

  const deletable = (r: Row) => !!r.trip && canDeleteTrip(r.trip.status);
  const selectable = shown.filter(deletable);
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
    const done = rows.filter((r) => picked.has(r.key) && r.trip?.status === 'Completed').length;
    Alert.alert(
      `Delete ${ids.length} trip${ids.length === 1 ? '' : 's'}?`,
      `${refs.slice(0, 8).join(', ')}${refs.length > 8 ? ` +${refs.length - 8} more` : ''}\n\nThey disappear from the trip lists, the driver app and the customer link. Admins can restore them from the Recycle bin.${done ? `\n\n${done} ${done === 1 ? 'is' : 'are'} delivered: ${COMPLETED_DELETE_WARNING.replace('This trip was delivered: ', '')}` : ''}`,
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

  const monthName = (n: number) => new Date(Date.UTC(y, m - 1 - n, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthCount = 12;
  const header = (
    <View style={s.head}>
      {/* Search, then the month, then two filters (owner 30 Oct: "keep the search bar", "drop-downs, better spaced"). */}
      <View style={s.searchBar}>
        <Search size={17} color={MUTED} />
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Trip no., customer, driver, truck, place"
          placeholderTextColor="#9A9AA6"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
            <X size={16} color={MUTED} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={s.month}>
        <TouchableOpacity
          style={[s.monthStep, (back === null || back >= monthCount - 1) && s.stepOff]}
          disabled={back === null || back >= monthCount - 1}
          onPress={() => { setBack((b) => (b ?? 0) + 1); setDayFilter(null); }}
          accessibilityLabel="Previous month"
          hitSlop={6}
        >
          <ChevronLeft size={20} color={INK} />
        </TouchableOpacity>
        <TouchableOpacity style={s.monthMid} onPress={() => setSheet('month')} accessibilityRole="button" accessibilityLabel={`Month: ${back === null ? 'All time' : monthName(back)}. Change`}>
          <Text style={s.monthText}>{back === null ? 'All time' : monthName(back)}</Text>
          <ChevronDown size={16} color={MUTED} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.monthStep, (back === null || back === 0) && s.stepOff]}
          disabled={back === null || back === 0}
          onPress={() => { setBack((b) => Math.max(0, (b ?? 0) - 1)); setDayFilter(null); }}
          accessibilityLabel="Next month"
          hitSlop={6}
        >
          <ChevronRight size={20} color={INK} />
        </TouchableOpacity>
      </View>

      <View style={s.filters}>
        <Pill icon={Building2} value={customer ?? 'All customers'} on={!!customer} onPress={() => onPickCustomer?.()} onClear={customer ? onClearCustomer : undefined} label="Customer" />
        <Pill icon={CircleDot} value={statusFilter ?? 'All statuses'} on={!!statusFilter} onPress={() => setSheet('status')} onClear={statusFilter ? () => setStatusFilter(null) : undefined} label="Status" />
      </View>
      <View style={s.filters}>
        <Pill icon={CalendarDays} value={dayFilter ? f.day(days.find(([k]) => k === dayFilter)?.[1].iso) || dayFilter : 'All days'} on={!!dayFilter} onPress={() => setSheet('day')} onClear={dayFilter ? () => setDayFilter(null) : undefined} label="Loading day" />
        <Pill icon={ArrowDownUp} value={sortBy === 'no' ? (order === 'desc' ? 'Trip no. ↓' : 'Trip no. ↑') : order === 'desc' ? 'Latest loading' : 'Earliest loading'} onPress={() => setSheet('sort')} label="Sort" />
      </View>

      <View style={s.summary}>
        <View style={s.sumTop}>
          <View>
            <Text style={s.bigNum}>{live.length}</Text>
            <Text style={s.bigLabel}>{live.length === 1 ? 'trip' : 'trips'}{rows.length > live.length ? ` · ${rows.length - live.length} deleted` : ''}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={s.range}>{lo != null && hi != null ? `${pad(lo)} → ${pad(hi)}` : '—'}</Text>
            {billed > 0 ? <Text style={s.bigLabel}>{`SAR ${Math.round(billed).toLocaleString('en-US')} billed`}</Text> : null}
            {missing > 0 ? <Text style={[s.bigLabel, { color: '#B54708' }]}>{`${missing} number${missing === 1 ? '' : 's'} not used`}</Text> : null}
          </View>
        </View>
        {counts.length ? (
          <>
            {/* Share of each status; the legend below doubles as a status filter. */}
            <View style={s.bar100}>
              {counts.map(([label, c]) => <View key={label} style={{ flex: c.n, backgroundColor: c.tone.fg, opacity: statusFilter && statusFilter !== label ? 0.25 : 1 }} />)}
            </View>
            <View style={s.legend}>
              {counts.map(([label, c]) => {
                const on = statusFilter === label;
                return (
                  <TouchableOpacity key={label} style={[s.leg, on && { backgroundColor: c.tone.bg, borderColor: c.tone.fg }]} onPress={() => setStatusFilter(on ? null : label)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <View style={[s.legDot, { backgroundColor: c.tone.fg }]} />
                    <Text style={s.legText}><Text style={{ fontWeight: '800', color: INK }}>{c.n}</Text>{` ${label.toLowerCase()}`}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}
      </View>

      <View style={s.listBar}>
        <Text style={s.listCount} numberOfLines={1}>
          {term ? `${shown.length} match${shown.length === 1 ? '' : 'es'}` : statusFilter ? `${shown.length} ${statusFilter.toLowerCase()}` : `${shown.length} row${shown.length === 1 ? '' : 's'}`}
          {dayFilter ? ` · ${f.day(days.find(([k]) => k === dayFilter)?.[1].iso)}` : ''}
        </Text>
        <TouchableOpacity style={[s.selectBtn, picked && s.selectOn]} onPress={() => setPicked((p) => (p ? null : new Set()))} accessibilityRole="button">
          <Text style={[s.selectText, picked && { color: '#fff' }]}>{picked ? 'Done' : 'Select'}</Text>
        </TouchableOpacity>
      </View>
      {picked ? (
        <TouchableOpacity style={s.selAll} onPress={() => setPicked(allPicked ? new Set() : new Set(selectable.map((r) => r.key)))} accessibilityRole="button">
          <Box on={allPicked} />
          <Text style={s.selAllText}>{allPicked ? 'Clear selection' : `Select all that can be deleted (${selectable.length})`}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={s.headRow}>
        {picked ? <View style={{ width: 22 }} /> : null}
        <TouchableOpacity style={[s.cNo, s.sortBtn]} onPress={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))} accessibilityRole="button" accessibilityLabel={order === 'asc' ? 'Trip number, lowest first. Tap for highest first' : 'Trip number, highest first. Tap for lowest first'} hitSlop={8}>
          <Text style={[s.h, { color: INK }]}>{sortBy === 'no' ? 'No.' : 'Date'}</Text>
          {order === 'asc' ? <ArrowUp size={12} color={INK} strokeWidth={3} /> : <ArrowDown size={12} color={INK} strokeWidth={3} />}
        </TouchableOpacity>
        <Text style={[s.h, { flex: 1 }]}>Customer · route</Text>
        <Text style={[s.h, s.cAmt]}>SAR</Text>
      </View>
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
    <FlatList
      data={shown}
      keyExtractor={(r) => r.key}
      contentContainerStyle={s.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={trips.isRefetching} onRefresh={() => { void trips.refetch(); void deleted.refetch(); }} tintColor={Colors.primary} />}
      renderItem={({ item: r, index }) => (
        <TouchableOpacity
          style={[s.row, index % 2 === 1 && s.rowAlt, index === 0 && s.rowFirst, index === shown.length - 1 && s.rowLast]}
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
          {/* Loading time, route, transit time, driver and truck (TestFlight 30 Oct: "should be visible"). */}
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={[s.cust, r.deleted && s.struck]} numberOfLines={1}>{r.customer}</Text>
            <Text style={s.route} numberOfLines={2}>{r.route}</Text>
            {!r.deleted && (r.day || r.tt != null) ? (
              <View style={s.meta}>
                <Clock3 size={12} color={MUTED} />
                <Text style={s.metaText} numberOfLines={1}>
                  {[r.day ? `Load ${f.time(r.day)}` : null, r.tt != null ? `TT ${shortDuration(r.tt)}` : 'No TT'].filter(Boolean).join('  ·  ')}
                </Text>
              </View>
            ) : null}
            {r.driver || r.plate ? (
              <View style={s.meta}>
                {r.driver ? <><UserRound size={12} color={MUTED} /><Text style={[s.metaText, { flexShrink: 1 }]} numberOfLines={1}>{r.driver}</Text></> : null}
                {r.plate ? <><Truck size={12} color={MUTED} style={r.driver ? { marginLeft: 6 } : undefined} /><Text style={[s.metaText, { flexShrink: 0 }]}>{r.plate}</Text></> : null}
              </View>
            ) : null}
            <View style={[s.status, { backgroundColor: r.tone.bg }]}>
              <Text style={[s.statusText, { color: r.tone.fg }]}>{r.status}</Text>
            </View>
          </View>
          <Text style={[s.amt, s.cAmt, (r.deleted || r.trip?.status === 'Cancelled') && s.struck]}>
            {r.amount != null ? Math.round(r.amount).toLocaleString('en-US') : '—'}
          </Text>
        </TouchableOpacity>
      )}
      ListEmptyComponent={trips.isLoading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 30 }} /> : term ? (
        <View style={{ alignItems: 'center', gap: 10, marginTop: 24 }}>
          <Text style={s.emptyText}>{`Nothing matches “${query.trim()}” in ${back === null ? 'any month' : title}.`}</Text>
          {back !== null ? (
            <TouchableOpacity style={s.selectBtn} onPress={() => setBack(null)} accessibilityRole="button">
              <Text style={s.selectText}>Search all time</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : <Text style={s.empty}>No trips in {back === null ? 'any month' : title}.</Text>}
    />
    <OptionSheet
      visible={sheet === 'month'}
      title="Month"
      value={back === null ? 'all' : String(back)}
      options={[{ value: '0', label: monthName(0), sub: 'This month' }, ...Array.from({ length: 11 }, (_, k) => ({ value: String(k + 1), label: monthName(k + 1) })), { value: 'all', label: 'All time', sub: 'Every trip, with numbers not used' }]}
      onPick={(v) => { setBack(v === 'all' ? null : Number(v)); setDayFilter(null); setSheet(null); }}
      onClose={() => setSheet(null)}
    />
    <OptionSheet
      visible={sheet === 'status'}
      title="Status"
      value={statusFilter ?? 'all'}
      options={[{ value: 'all', label: 'All statuses', sub: `${rows.length} rows` }, ...counts.map(([label, c]) => ({ value: label, label, sub: `${c.n}`, dot: c.tone.fg }))]}
      onPick={(v) => { setStatusFilter(v === 'all' ? null : v); setSheet(null); }}
      onClose={() => setSheet(null)}
    />
    <OptionSheet
      visible={sheet === 'day'}
      title="Loading day"
      value={dayFilter ?? 'all'}
      options={[{ value: 'all', label: 'All days', sub: `${rows.length} rows` }, ...days.map(([k, d]) => ({ value: k, label: f.day(d.iso), sub: `${d.n} trip${d.n === 1 ? '' : 's'}` }))]}
      onPick={(v) => { setDayFilter(v === 'all' ? null : v); setSheet(null); }}
      onClose={() => setSheet(null)}
    />
    <OptionSheet
      visible={sheet === 'sort'}
      title="Sort"
      value={`${sortBy}-${order}`}
      options={[
        { value: 'no-desc', label: 'Trip number, newest first', sub: 'TRP-0107, 0106 …' },
        { value: 'no-asc', label: 'Trip number, oldest first', sub: 'TRP-0001, 0002 …' },
        { value: 'date-desc', label: 'Loading day, latest first' },
        { value: 'date-asc', label: 'Loading day, earliest first' },
      ]}
      onPick={(v) => { const [k, o] = v.split('-'); setSortBy(k as 'no' | 'date'); setOrder(o as 'asc' | 'desc'); setSheet(null); }}
      onClose={() => setSheet(null)}
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

/** A filter that opens a list: icon, the choice and a chevron; dark when set, with ✕ to clear. */
function Pill({ icon: Icon, label, value, on, onPress, onClear }: { icon: LucideIcon; label: string; value: string; on?: boolean; onPress: () => void; onClear?: () => void }) {
  return (
    <TouchableOpacity style={[s.pill, on && s.pillOn]} onPress={onPress} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      <Icon size={15} color={on ? '#fff' : MUTED} />
      <Text style={[s.pillText, on && { color: '#fff' }]} numberOfLines={1}>{value}</Text>
      {onClear ? (
        <TouchableOpacity onPress={onClear} hitSlop={10} accessibilityLabel={`Clear ${label}`}>
          <X size={15} color="#fff" strokeWidth={2.6} />
        </TouchableOpacity>
      ) : (
        <ChevronDown size={15} color={MUTED} />
      )}
    </TouchableOpacity>
  );
}

/** A short list to pick one from (no search box: a handful of choices). */
function OptionSheet({ visible, title, value, options, onPick, onClose }: {
  visible: boolean;
  title: string;
  value: string;
  options: { value: string; label: string; sub?: string; dot?: string }[];
  onPick: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title={title} maxHeight="80%">
      <ScrollView style={{ maxHeight: 460 }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <TouchableOpacity key={o.value} style={[s.opt, on && s.optOn]} onPress={() => onPick(o.value)} activeOpacity={0.7} accessibilityRole="radio" accessibilityState={{ checked: on }}>
              {o.dot ? <View style={[s.optDot, { backgroundColor: o.dot }]} /> : null}
              <Text style={[s.optLabel, on && { color: Colors.primaryDark }]}>{o.label}</Text>
              {o.sub ? <Text style={s.optSub}>{o.sub}</Text> : null}
              {on ? <Check size={16} color={Colors.primaryDark} strokeWidth={3} /> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </AppModal>
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
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 200 },
  head: { gap: 12, marginBottom: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, backgroundColor: '#fff', paddingHorizontal: 13, borderWidth: 1, borderColor: '#E9EAEE' },
  searchInput: { flex: 1, fontSize: 15, color: INK, paddingVertical: 0 },
  month: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E9EAEE', height: 46, paddingHorizontal: 4 },
  monthStep: { width: 40, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.25 },
  monthMid: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38 },
  monthText: { fontSize: 16, fontWeight: '800', color: INK },
  filters: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7, height: 40, borderRadius: 20, paddingHorizontal: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E4E6EB' },
  pillOn: { backgroundColor: INK, borderColor: INK },
  pillText: { flex: 1, fontSize: 14, fontWeight: '700', color: INK },
  bar100: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', backgroundColor: '#F6F6F8' },
  legDot: { width: 8, height: 8, borderRadius: 4 },
  legText: { fontSize: 12.5, color: MUTED },
  listBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  listCount: { flex: 1, fontSize: 13, fontWeight: '700', color: MUTED },
  selectBtn: { paddingHorizontal: 16, height: 34, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E4E6EB', justifyContent: 'center' },
  selectOn: { backgroundColor: INK, borderColor: INK },
  selectText: { fontSize: 13, fontWeight: '700', color: INK },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E6EB' },
  optOn: { backgroundColor: '#FFF6F3' },
  optDot: { width: 9, height: 9, borderRadius: 5 },
  optLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
  optSub: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  summary: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12 },
  sumTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bigNum: { fontSize: 30, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  bigLabel: { fontSize: 12.5, fontWeight: '600', color: MUTED },
  range: { fontSize: 14, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, marginTop: 2 },
  h: { fontSize: 11, fontWeight: '800', color: MUTED, letterSpacing: 0.4, textTransform: 'uppercase' },
  cNo: { width: 74 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cAmt: { width: 64, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10 },
  rowAlt: { backgroundColor: '#FAFAFB' },
  rowFirst: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  rowLast: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  no: { fontSize: 16, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  day: { fontSize: 11, color: MUTED, marginTop: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
  metaText: { fontSize: 12, color: '#55545C' },
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
  emptyText: { textAlign: 'center', color: MUTED, fontSize: 14, paddingHorizontal: 20 },
});
