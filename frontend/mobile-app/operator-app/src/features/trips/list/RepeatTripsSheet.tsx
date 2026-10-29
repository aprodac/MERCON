/**
 * "Repeat trips…" on a day in Schedule or History: tick the day's trips, pick
 * the date (and an optional shift) and the server copies them — customer,
 * quotation, route, truck, driver, payout and extras — as Scheduled trips,
 * notifying the drivers. Trips that clash come back to be confirmed.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Check, ChevronLeft, ChevronRight, Pencil } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { addDaysToDateStr } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { operatorService, type OperatorTrip, type RepeatResult } from '../../../lib/operator';
import { INK, MUTED, tap } from '../details/components/parts';
import { dayLabel, driverNameOf, routeOf, type TimeFmt } from './tripListModel';

const SHIFT_STEP = 15;

const shiftText = (m: number) => (m === 0 ? 'the same times' : `${m > 0 ? '+' : '−'}${Math.abs(m)} min`);

export function RepeatTripsSheet({ visible, trips, sourceDay, todayKey, f, onClose, onCreated }: {
  visible: boolean;
  /** The chosen day's trips (cancelled ones are left out here). */
  trips: OperatorTrip[];
  sourceDay: string;
  todayKey: string;
  f: TimeFmt;
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const list = useMemo(() => trips.filter((t) => t.status !== 'Cancelled' && t.planned_start), [trips]);
  // TestFlight 29 Oct: "edit option in the selected trip" — start a new trip from this one in Create
  // trip (customer, quotation / route, truck and driver copied) and change what differs before creating.
  const editCopy = (t: OperatorTrip) => {
    tap();
    onClose();
    router.push({ pathname: '/create-trip', params: { copyTripId: t.id } } as any);
  };
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(() => addDaysToDateStr(todayKey, 1));
  const [shift, setShift] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, RepeatResult> | null>(null);
  const [anyway, setAnyway] = useState<Set<string>>(new Set());

  // Each time the sheet opens: everything ticked, tomorrow (or the day after the source day if that's later).
  const [shownFor, setShownFor] = useState(false);
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) {
      setPicked(new Set(list.map((t) => t.id)));
      setTarget(addDaysToDateStr(sourceDay >= todayKey ? sourceDay : todayKey, 1));
      setShift(0);
      setResults(null);
      setAnyway(new Set());
      setError(null);
    }
  }

  const byId = useMemo(() => new Map(list.map((t) => [t.id, t])), [list]);
  const label = (t: OperatorTrip) => {
    const r = routeOf(t);
    return { title: `${t.ref_id ?? 'Trip'} · ${f.time(t.planned_start)}`, sub: `${r.from} → ${r.to}${r.back ? ' · round trip' : ''}${driverNameOf(t) ? ` · ${driverNameOf(t)}` : ''}` };
  };
  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  const run = async (ids: string[], createAnywayIds: string[]) => {
    setBusy(true);
    setError(null);
    try {
      const out = await operatorService.repeatTrips({ tripIds: ids, targetDate: target, shiftMinutes: shift, createAnywayIds });
      setResults((prev) => {
        const next = new Map(prev ?? []);
        out.results.forEach((r) => next.set(r.trip_id, r));
        return next;
      });
      setAnyway(new Set());
      if (out.summary.created) onCreated();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const all = results ? [...results.values()] : [];
  const clashes = all.filter((r): r is Extract<RepeatResult, { status: 'clash' }> => r.status === 'clash');
  const created = all.filter((r) => r.status === 'created').length;
  const skipped = all.filter((r): r is Extract<RepeatResult, { status: 'skipped' }> => r.status === 'skipped');
  const reasons = [...new Set(skipped.map((r) => r.reason))];
  const resultLine = [`${created} created`, skipped.length ? `${skipped.length} skipped (${reasons.join('; ')})` : '', clashes.length ? `${clashes.length} need${clashes.length === 1 ? 's' : ''} a decision` : ''].filter(Boolean).join(', ');
  const canGoBack = target > todayKey;

  return (
    <AppModal visible={visible} onClose={busy ? undefined : onClose} type="bottom-sheet" title="Repeat trips" maxHeight="92%">
      {results ? (
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
          <Text style={s.result} accessibilityRole="alert">{resultLine}</Text>
          {created ? <Text style={s.sub}>Scheduled for {dayLabel(target, todayKey, f)}. The drivers have been notified.</Text> : null}
          {skipped.map((r) => (
            <View key={r.trip_id} style={s.row}>
              <View style={{ flex: 1 }}><Text style={s.title}>{byId.get(r.trip_id) ? label(byId.get(r.trip_id)!).title : 'Trip'}</Text><Text style={s.sub}>{r.reason}</Text></View>
            </View>
          ))}
          {clashes.length ? (
            <>
              <Text style={s.head}>These clash with something already booked</Text>
              {clashes.map((r) => {
                const t = byId.get(r.trip_id);
                const on = anyway.has(r.trip_id);
                return (
                  <TouchableOpacity key={r.trip_id} style={s.row} onPress={() => { tap(); setAnyway((a) => toggle(a, r.trip_id)); }} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                    <Box on={on} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.title}>{t ? label(t).title : 'Trip'}</Text>
                      {t ? <Text style={s.sub}>{label(t).sub}</Text> : null}
                      {r.clashes.map((c, i) => <Text key={i} style={s.clash}>{c.message}</Text>)}
                    </View>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[s.primary, !anyway.size && s.disabled]}
                disabled={!anyway.size || busy}
                onPress={() => run([...anyway], [...anyway])}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={s.primaryText}>{`Create anyway${anyway.size ? ` (${anyway.size})` : ''}`}</Text>}
              </TouchableOpacity>
            </>
          ) : null}
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity style={s.secondary} onPress={onClose} accessibilityRole="button"><Text style={s.secondaryText}>Done</Text></TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={s.bulk}>
            <Text style={s.sub}>{dayLabel(sourceDay, todayKey, f)} · {picked.size} of {list.length} selected</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => { tap(); setPicked(new Set(list.map((t) => t.id))); }} hitSlop={8}><Text style={s.link}>All</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { tap(); setPicked(new Set()); }} hitSlop={8}><Text style={s.link}>None</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 8 }}>
            {list.length === 0 ? <Text style={s.sub}>No trips on this day to repeat.</Text> : list.map((t) => {
              const on = picked.has(t.id);
              const l = label(t);
              return (
                <TouchableOpacity key={t.id} style={s.row} onPress={() => { tap(); setPicked((p) => toggle(p, t.id)); }} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                  <Box on={on} />
                  <View style={{ flex: 1, gap: 2 }}><Text style={s.title}>{l.title}</Text><Text style={s.sub} numberOfLines={2}>{l.sub}</Text></View>
                  <TouchableOpacity style={s.editBtn} onPress={() => editCopy(t)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Edit and create a copy of ${t.ref_id ?? 'this trip'}`}>
                    <Pencil size={13} color={INK} />
                    <Text style={s.editText}>Edit</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={s.stepRow}>
            <Text style={s.stepLabel}>Create for</Text>
            <Stepper onMinus={canGoBack ? () => setTarget(addDaysToDateStr(target, -1)) : undefined} onPlus={() => setTarget(addDaysToDateStr(target, 1))} text={dayLabel(target, todayKey, f)} />
          </View>
          <View style={s.stepRow}>
            <Text style={s.stepLabel}>At</Text>
            <Stepper onMinus={() => setShift((m) => m - SHIFT_STEP)} onPlus={() => setShift((m) => m + SHIFT_STEP)} text={shiftText(shift)} />
          </View>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[s.primary, (!picked.size || busy) && s.disabled]}
            disabled={!picked.size || busy}
            onPress={() => run([...picked], [])}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={s.primaryText}>{`Create ${picked.size} for ${dayLabel(target, todayKey, f)}${shift ? `, ${shiftText(shift)}` : ''}`}</Text>}
          </TouchableOpacity>
        </View>
      )}
    </AppModal>
  );
}

function Box({ on }: { on: boolean }) {
  return <View style={[s.box, on && s.boxOn]}>{on ? <Check size={14} color={Colors.white} strokeWidth={3} /> : null}</View>;
}

function Stepper({ text, onMinus, onPlus }: { text: string; onMinus?: () => void; onPlus: () => void }) {
  return (
    <View style={s.stepper}>
      <TouchableOpacity onPress={() => { tap(); onMinus?.(); }} disabled={!onMinus} style={[s.stepBtn, !onMinus && { opacity: 0.35 }]} accessibilityLabel="Earlier"><ChevronLeft size={18} color={INK} /></TouchableOpacity>
      <Text style={s.stepText}>{text}</Text>
      <TouchableOpacity onPress={() => { tap(); onPlus(); }} style={s.stepBtn} accessibilityLabel="Later"><ChevronRight size={18} color={INK} /></TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F1F2F5' },
  editText: { fontSize: 12, fontWeight: '700', color: INK },
  bulk: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 14, backgroundColor: '#F6F6F7' },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#C9CAD1', alignItems: 'center', justifyContent: 'center', marginTop: 1, backgroundColor: Colors.white },
  boxOn: { backgroundColor: INK, borderColor: INK },
  title: { fontSize: 14, fontWeight: '800', color: INK },
  sub: { fontSize: 13, color: MUTED, fontWeight: '600' },
  head: { fontSize: 14, fontWeight: '800', color: INK, marginTop: 4 },
  clash: { fontSize: 12.5, color: '#B42318', fontWeight: '600' },
  link: { fontSize: 14, fontWeight: '800', color: '#2449A8' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepLabel: { fontSize: 14, fontWeight: '700', color: INK },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F1F1F3', borderRadius: 12, padding: 4 },
  stepBtn: { width: 34, height: 34, borderRadius: 9, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  stepText: { minWidth: 120, textAlign: 'center', fontSize: 14, fontWeight: '800', color: INK },
  primary: { backgroundColor: INK, borderRadius: 14, paddingVertical: 15, alignItems: 'center', paddingHorizontal: 12 },
  primaryText: { color: Colors.white, fontWeight: '800', fontSize: 15, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  secondary: { backgroundColor: '#F1F1F3', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: INK, fontWeight: '800' },
  result: { fontSize: 18, fontWeight: '800', color: INK },
  error: { fontSize: 13, color: '#B42318', fontWeight: '600' },
});
