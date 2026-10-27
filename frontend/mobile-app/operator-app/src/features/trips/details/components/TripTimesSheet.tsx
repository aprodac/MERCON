/**
 * Copy a customer-app trip's real stop times off the driver's screenshots, all
 * stops in one pass. The customer's app lists every stop's arrive / departure
 * time on one screen, so the rows follow the same order: the operator taps a
 * time, rolls the hour / minute / second wheels to the screenshot's value and
 * hits "Next" to move on. An untouched time keeps the driver's tapped time.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, FlatList } from 'react-native';
import { isoToWall, resolveStopTimes, type StopTimeRow } from '@mercon/shared-types';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { operatorService, type OperatorTripDetail, type OperatorTripDocument } from '../../../../lib/operator';
import { sortedStops, stopName } from '../tripDetailsModel';
import { ACTION, INK, MUTED } from './parts';
import { TimeWheel } from './TimeWheel';
import { ZoomableImage } from '../../../../components/ZoomableImage';

/** Drop-offs show planned and arrived only — when the truck left doesn't matter there. */
export const isDropoff = (st: { stop_type?: string | null }) => /drop|deliver/i.test(st.stop_type ?? '');

/** A screenshot from the customer's app (EXTERNAL_APP trips). */
export const isAppScreenshot = (d: OperatorTripDocument) => d.ai_extracted_json?.source === 'external_app_screenshot';
/** …whose times the operator still has to check. */
export const pendingTimeCheck = (d: OperatorTripDocument) => isAppScreenshot(d) && d.status === 'PendingReview';

interface Props {
  visible: boolean;
  trip: OperatorTripDetail;
  tz: string;
  /** Opened from one stop's "check" link: show only that stop's screenshots at first. */
  stopId?: string | null;
  onClose: () => void;
  onDone: () => void;
}

type Field = 'arrival' | 'departure';
const FIELDS: Field[] = ['arrival', 'departure'];
const FIELD_LABEL: Record<Field, string> = { arrival: 'Arrived', departure: 'Left' };

export function TripTimesSheet({ visible, trip, tz, stopId, onClose, onDone }: Props) {
  const stops = useMemo(() => sortedStops(trip), [trip]);
  // In the order the driver sent them, first one first (TestFlight 23 Oct: "the 4th one is actually the first").
  const allShots = useMemo(
    () => (trip.documents ?? []).filter(isAppScreenshot).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [trip.documents],
  );
  /** Each screenshot's place in the order sent, across the whole trip — the same number when one stop's are shown alone. */
  const sentNo = useMemo(() => new Map(allShots.map((d, i) => [d.id, i + 1])), [allShots]);
  const sentAt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
    } catch {
      return '';
    }
  };
  const pending = allShots.filter(pendingTimeCheck).length;
  const shotsOf = (id: string) => allShots.filter((d) => d.ai_extracted_json?.stop_id === id);
  /** Editing one stop shows only its screenshots; "See all" shows every one. */
  const [onlyStop, setOnlyStop] = useState<string | null>(null);
  const focused = onlyStop ? shotsOf(onlyStop) : [];
  const shots = focused.length ? focused : allShots;

  const [typed, setTyped] = useState<Record<string, Record<Field, string>>>({});
  /** A day the operator set for a time (YYYY-MM-DD), when the inferred one is wrong. */
  const [typedDate, setTypedDate] = useState<Record<string, Partial<Record<Field, string>>>>({});
  const [shotIdx, setShotIdx] = useState(0);
  const [tall, setTall] = useState(false);
  /** Width of the screenshot strip — one screenshot per page, swiped sideways. */
  const [shotW, setShotW] = useState(0);
  const shotList = useRef<FlatList<OperatorTripDocument>>(null);
  /** The time rows' list, and where each stop's row sits in it — Next scrolls the new time into view. */
  const rowsScroll = useRef<ScrollView>(null);
  const rowY = useRef<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  /** Which time the wheels are editing: index into stops × FIELDS. */
  const [active, setActive] = useState<number | null>(null);

  // Start clean each time the sheet opens.
  const [shownFor, setShownFor] = useState(false);
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) { setTyped({}); setTypedDate({}); setShotIdx(0); setTall(false); setActive(null); setOnlyStop(stopId ?? null); }
  }

  const rows: StopTimeRow[] = stops.map((s) => ({
    stopId: s.id,
    recordedArrival: s.actual_arrival,
    recordedDeparture: s.actual_departure,
    arrival: typed[s.id]?.arrival ?? '',
    departure: typed[s.id]?.departure ?? '',
    leftFollowsArrival: isDropoff(s),
    arrivalDate: typedDate[s.id]?.arrival,
    departureDate: typedDate[s.id]?.departure,
    place: s.location?.id || s.location_name?.trim().toLowerCase() || null,
  }));
  const fallback = trip.actual_start || trip.planned_start || stops[0]?.planned_arrival || new Date().toISOString();
  const resolved = resolveStopTimes(rows, tz, fallback);
  // A drop-off's "Left" isn't shown: it follows "Arrived" (leftFollowsArrival),
  // so it never blocks saving the stops after it (TestFlight: "all times are in order, then why").
  const bad = (r: (typeof resolved)[number]) => !!(r.arrival.error || r.departure.error);
  // A stop with a problem is left out of the save; the others save (TestFlight 24 Oct: "the issue
  // is in the last stop … make it possible to save each"). Its screenshots stay to check.
  const badStops = resolved.filter(bad).map((r) => r.stopId);
  const changes = resolved.filter((r) => !bad(r) && (r.arrival.changed || r.departure.changed));
  // What the operator actually changed: a drop-off's hidden "Left" pulled back on its own rides
  // along when saving, but doesn't make an untouched sheet say "Save 1 stop".
  const edited = resolved.filter((r, i) => !bad(r) && (r.arrival.changed || (r.departure.changed && !isDropoff(stops[i]))));
  const hasError = badStops.length > 0 && edited.length === 0;

  const clock = (iso: string | null) => (iso ? isoToWall(iso, tz).clock : null);
  /** "17 Oct" — said instead of "+1d" when a time falls on another day than the trip's first stop (TestFlight: "why +1 day"). */
  const dayOf = (iso: string) => new Date(`${isoToWall(iso, tz).date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const set = (stopId: string, field: Field, value: string) =>
    setTyped((t) => ({ ...t, [stopId]: { ...(t[stopId] ?? { arrival: '', departure: '' }), [field]: value } }));

  /** What a time box shows: the picked time, else the time on record. */
  const shown = (idx: number) => {
    const st = stops[Math.floor(idx / 2)];
    const field = FIELDS[idx % 2];
    return typed[st.id]?.[field] || clock(resolved[Math.floor(idx / 2)][field].iso);
  };
  /** Where the wheels start: this time, else the nearest earlier one (times only move forward). */
  const wheelStart = (idx: number) => {
    for (let i = idx; i >= 0; i--) {
      const v = shown(i);
      if (v) return v;
    }
    return clock(fallback) ?? '00:00:00';
  };
  /** A drop-off's "Left" box isn't shown, so "Next" skips it. */
  const hidden = (idx: number) => FIELDS[idx % 2] === 'departure' && isDropoff(stops[Math.floor(idx / 2)]);
  const nextAfter = (idx: number) => {
    for (let i = idx + 1; i < stops.length * 2; i++) if (!hidden(i)) return i;
    return null;
  };
  /** "Back" beside "Next" (TestFlight 24 Oct). */
  const prevBefore = (idx: number) => {
    for (let i = idx - 1; i >= 0; i--) if (!hidden(i)) return i;
    return null;
  };
  /** The day a time box's time falls on: the one set, else the resolved one, else the day of the time before it. */
  const dayFor = (idx: number): string | null => {
    for (let i = idx; i >= 0; i--) {
      const st = stops[Math.floor(i / 2)];
      const field = FIELDS[i % 2];
      const iso = resolved[Math.floor(i / 2)]?.[field].iso;
      const day = typedDate[st.id]?.[field] ?? (iso ? isoToWall(iso, tz).date : null);
      if (day) return day;
    }
    return null;
  };
  /** Move a time a day back or forward; an untyped one takes the time it shows. */
  const shiftDay = (idx: number, days: number) => {
    const st = stops[Math.floor(idx / 2)];
    const field = FIELDS[idx % 2];
    const from = dayFor(idx) ?? isoToWall(fallback, tz).date;
    const [y, m, d] = from.split('-').map(Number);
    const to = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
    if (!typed[st.id]?.[field]) set(st.id, field, wheelStart(idx));
    setTypedDate((t) => ({ ...t, [st.id]: { ...(t[st.id] ?? {}), [field]: to } }));
  };
  const longDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  /**
   * Swiping to another screenshot while editing moves the time being edited to
   * that screenshot's stop (TestFlight: "when I swipe to page 2 it should show
   * page 2's time to adjust").
   */
  const onSwiped = (i: number) => {
    setShotIdx(i);
    if (active === null) return;
    const stopIdx = stops.findIndex((st) => st.id === shots[i]?.ai_extracted_json?.stop_id);
    if (stopIdx >= 0 && Math.floor(active / 2) !== stopIdx) setActive(stopIdx * 2);
  };

  /** Start editing a time; the strip switches to that stop's own screenshots when it has any. */
  const edit = (idx: number | null, keepShot = false) => {
    setActive(idx);
    // Next / Back only move the time being edited; the screenshot stays where the operator swiped to.
    if (idx === null || keepShot) return;
    const id = stops[Math.floor(idx / 2)]?.id;
    if (id && id !== onlyStop && shotsOf(id).length) { setOnlyStop(id); setShotIdx(0); }
  };

  // Bring the time being edited to the top of the rows (the wheels take room below, so it would sit out of view).
  useEffect(() => {
    if (active === null) return;
    const y = rowY.current[stops[Math.floor(active / 2)]?.id ?? ''];
    if (y !== undefined) rowsScroll.current?.scrollTo({ y: Math.max(0, y - 4), animated: true });
  }, [active, stops]);

  /**
   * A problem with stop i's times, said in full on its own line under the row
   * (TestFlight: "Earlier than … not showing full text").
   */
  const problemOf = (i: number): string | null => {
    const r = resolved[i];
    const name = stopName(stops[i], i);
    /** Two times on different days say their day too ("06:33 on 22 Oct" vs "06:33 on 24 Oct"). */
    const pair = (a: string | null, b: string | null) => {
      const apart = !!a && !!b && isoToWall(a, tz).date !== isoToWall(b, tz).date;
      const one = (x: string | null) => (x ? `${clock(x)}${apart ? ` on ${dayOf(x)}` : ''}` : '');
      return [one(a), one(b)] as const;
    };
    if (r.arrival.error === 'Earlier than the stop before') {
      let j = i - 1;
      while (j >= 0 && !(resolved[j].departure.iso || resolved[j].arrival.iso)) j--;
      const prev = j >= 0 ? resolved[j].departure.iso ?? resolved[j].arrival.iso : null;
      const prevWhat = j >= 0 ? (resolved[j].departure.iso && !isDropoff(stops[j]) ? 'left' : 'reached') : '';
      const [here, there] = pair(r.arrival.iso, prev);
      return `Arrived ${here} at ${name} is before ${j >= 0 ? `the truck ${prevWhat} ${stopName(stops[j], j)} (${there})` : 'the stop before'}. Fix one of the two.`;
    }
    if (r.departure.error === 'Left before arrived') {
      const [left, arrived] = pair(r.departure.iso, r.arrival.iso);
      return `Left ${name} at ${left}, before it arrived (${arrived}).`;
    }
    const other = r.arrival.error ?? r.departure.error;
    return other ? `${name}: ${other}` : null;
  };

  const confirm = async () => {
    if (hasError) return;
    setSaving(true);
    try {
      await operatorService.confirmTripTimes(trip.id, (edited.length ? changes : []).map((c) => ({
        stop_id: c.stopId,
        ...(c.arrival.changed && c.arrival.iso ? { actual_arrival: c.arrival.iso } : {}),
        ...(c.departure.changed && c.departure.iso ? { actual_departure: c.departure.iso } : {}),
      })), badStops);
      onDone();
      onClose();
    } catch (e) {
      Alert.alert('Could not save the times', getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const shot = shots[Math.min(shotIdx, shots.length - 1)];
  const shotUrl = resolveMediaUrl(shot?.file_url);
  const shotStop = stops.findIndex((s) => s.id === shot?.ai_extracted_json?.stop_id);

  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title={`Check times · ${trip.ref_id}`} maxHeight="94%">
      {shotUrl ? (
        <View style={{ gap: 6 }}>
          {/* Swipe sideways between the screenshots; tap one to enlarge it, then pinch to zoom. */}
          <View onLayout={(e) => setShotW(e.nativeEvent.layout.width)}>
            {shotW > 0 ? (
              <FlatList
                ref={shotList}
                key={focused.length ? onlyStop ?? 'all' : 'all'}
                data={shots}
                keyExtractor={(d) => d.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={Math.min(shotIdx, shots.length - 1)}
                getItemLayout={(_, i) => ({ length: shotW, offset: shotW * i, index: i })}
                onMomentumScrollEnd={(e) => onSwiped(Math.round(e.nativeEvent.contentOffset.x / shotW))}
                renderItem={({ item, index }) => (
                  <TouchableOpacity style={{ width: shotW }} activeOpacity={0.9} onPress={() => setTall((t) => !t)}>
                    {/* Which picture this is (TestFlight: "show its serial number, 1st picture, 2nd picture"). */}
                    {/* Its number in the order sent and when (owner, 23 Oct): "#2 · sent 09:48 · 4 in all". */}
                    <View style={s.shotNo} pointerEvents="none">
                      <Text style={s.shotNoText}>
                        #{sentNo.get(item.id) ?? index + 1}{sentAt(item.createdAt) ? ` · sent ${sentAt(item.createdAt)}` : ''}{allShots.length > 1 ? ` · ${allShots.length} in all` : ''}
                      </Text>
                    </View>
                    {/* Pinch to zoom at either size, also while a time is being edited (TestFlight: "not able to zoom"). */}
                    <ZoomableImage uri={resolveMediaUrl(item.file_url)} style={[s.shot, tall && (active === null ? s.shotTall : s.shotTallEditing)]} />
                  </TouchableOpacity>
                )}
              />
            ) : null}
          </View>
          <View style={s.shotBar}>
            <Text style={[s.hint, { flex: 1 }]} numberOfLines={1}>
              {shotStop >= 0 ? stopName(stops[shotStop], shotStop) : 'Trip'}{focused.length ? ' only' : ''} · {shots.length > 1 ? 'swipe for the next · ' : ''}pinch to zoom · {tall ? 'tap to shrink' : 'tap to enlarge'}
            </Text>
            {shots.length > 1 ? (
              <View style={s.pager}>
                {shots.map((d, i) => (
                  <TouchableOpacity key={d.id} onPress={() => { setShotIdx(i); shotList.current?.scrollToIndex({ index: i, animated: true }); }} hitSlop={6}>
                    <View style={[s.dot, i === shotIdx && s.dotOn, pendingTimeCheck(d) && i !== shotIdx && s.dotPending]} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {focused.length && focused.length < allShots.length ? (
              <TouchableOpacity onPress={() => { setOnlyStop(null); setShotIdx(0); }} hitSlop={8} accessibilityRole="button">
                <Text style={s.link}>See all {allShots.length}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      <ScrollView ref={rowsScroll} style={{ marginTop: 10 }} keyboardShouldPersistTaps="handled">
        <View style={s.headRow}>
          <Text style={[s.cap, { flex: 1 }]}>Stop</Text>
          <Text style={[s.cap, s.col]}>Arrived</Text>
          <Text style={[s.cap, s.col]}>Left</Text>
        </View>
        {stops.map((st, i) => {
          const r = resolved[i];
          const problem = problemOf(i);
          return (
            <View key={st.id} style={s.rowWrap} onLayout={(e) => { rowY.current[st.id] = e.nativeEvent.layout.y; }}>
              <View style={s.row}>
                <View style={{ flex: 1, minWidth: 0, paddingTop: 7 }}>
                  <Text style={s.name} numberOfLines={1}>{stopName(st, i)}</Text>
                  <Text style={s.hint} numberOfLines={1}>
                    {st.actual_arrival ? `tapped ${clock(st.actual_arrival)?.slice(0, 5)}${st.actual_departure ? `–${clock(st.actual_departure)?.slice(0, 5)}` : ''}` : 'not reached'}
                  </Text>
                </View>
                {FIELDS.map((field, f) => {
                  if (hidden(i * 2 + f)) return <View key={field} style={s.col} />;
                  const t = r[field];
                  const recorded = field === 'arrival' ? st.actual_arrival : st.actual_departure;
                  const idx = i * 2 + f;
                  const value = typed[st.id]?.[field] || clock(recorded);
                  return (
                    <View key={field} style={s.col}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => edit(active === idx ? null : idx)}
                        accessibilityLabel={`${stopName(st, i)} ${FIELD_LABEL[field]}`}
                        style={[s.input, t.changed && s.inputChanged, !!t.error && s.inputError, active === idx && s.inputActive]}
                      >
                        <Text style={[s.inputText, !typed[st.id]?.[field] && { color: '#A1A1AA' }]}>{value ?? 'set'}</Text>
                      </TouchableOpacity>
                      <Text style={s.note} numberOfLines={2}>
                        {t.error ? ' ' : t.changed ? [t.dayOffset && t.iso ? dayOf(t.iso) : '', recorded ? `was ${clock(recorded)?.slice(0, 5)}` : 'new'].filter(Boolean).join(' · ') : ' '}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {problem ? <Text style={s.problem}>{problem}</Text> : null}
            </View>
          );
        })}
      </ScrollView>

      {active !== null && stops[Math.floor(active / 2)] ? (() => {
        const i = Math.floor(active / 2);
        const st = stops[i];
        const field = FIELDS[active % 2];
        const recorded = field === 'arrival' ? st.actual_arrival : st.actual_departure;
        const picked = !!typed[st.id]?.[field];
        const next = nextAfter(active);
        const prev = prevBefore(active);
        return (
          <View style={s.panel}>
            <View style={s.panelHead}>
              <Text style={s.name} numberOfLines={1}>{stopName(st, i)} · {FIELD_LABEL[field]}</Text>
              {picked ? (
                <TouchableOpacity onPress={() => { set(st.id, field, ''); setTypedDate((t) => ({ ...t, [st.id]: { ...(t[st.id] ?? {}), [field]: undefined } })); }} hitSlop={8}>
                  <Text style={s.link}>{recorded ? `Undo · tapped ${clock(recorded)}` : 'Clear'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {/* The day, with ‹ › to move it (TestFlight 24 Oct: "a date column … for any confusion"). */}
            <View style={s.dayRow}>
              <TouchableOpacity style={s.dayBtn} onPress={() => shiftDay(active, -1)} hitSlop={6} accessibilityLabel="Day before">
                <Text style={s.dayBtnText}>‹</Text>
              </TouchableOpacity>
              <Text style={s.dayText}>
                {dayFor(active) ? longDay(dayFor(active) as string) : '—'}
                {typedDate[st.id]?.[field] ? <Text style={s.daySet}>  · set by you</Text> : null}
              </Text>
              <TouchableOpacity style={s.dayBtn} onPress={() => shiftDay(active, 1)} hitSlop={6} accessibilityLabel="Day after">
                <Text style={s.dayBtnText}>›</Text>
              </TouchableOpacity>
            </View>
            <TimeWheel key={active} value={wheelStart(active)} onChange={(v) => set(st.id, field, v)} />
            <View style={s.panelBtns}>
              {prev !== null ? (
                <TouchableOpacity style={s.ghostBtn} onPress={() => edit(prev, true)} accessibilityLabel="Back to the time before">
                  <Text style={s.ghostText} numberOfLines={1}>‹ Back</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={s.ghostBtn} onPress={() => setActive(null)}>
                <Text style={s.ghostText}>Done</Text>
              </TouchableOpacity>
              {next !== null ? (
                <TouchableOpacity style={[s.ghostBtn, { flex: 2 }]} onPress={() => edit(next, true)}>
                  <Text style={s.ghostText} numberOfLines={1}>
                    Next: {stopName(stops[Math.floor(next / 2)], Math.floor(next / 2))} · {FIELD_LABEL[FIELDS[next % 2]]} ›
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })() : (
        <Text style={[s.hint, { marginTop: 8 }]}>
          {shots.length === 0 ? 'Times the driver tapped' : pending > 0 ? `${pending} screenshot${pending === 1 ? '' : 's'} to check` : 'All screenshots checked'} · tap a time to change it · untouched times stay as tapped
        </Text>
      )}
      <TouchableOpacity style={[s.btn, (saving || hasError) && { opacity: 0.5 }]} onPress={confirm} disabled={saving || hasError}>
        <Text style={s.btnText}>
          {saving ? 'Saving…' : edited.length ? `Save ${edited.length} stop${edited.length === 1 ? '' : 's'}${badStops.length ? ` · ${badStops.length} to fix later` : ''}` : badStops.length ? 'Fix the times in red' : 'Times are right'}
        </Text>
      </TouchableOpacity>
    </AppModal>
  );
}

const s = StyleSheet.create({
  shot: { width: '100%', height: 200, borderRadius: 14, backgroundColor: '#F1F3F7' },
  shotTall: { height: 440 },
  shotTallEditing: { height: 320 },
  shotNo: { position: 'absolute', top: 8, left: 8, zIndex: 2, backgroundColor: 'rgba(17,17,17,0.72)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  shotNoText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  shotBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pager: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D4D4D8' },
  dotOn: { backgroundColor: INK },
  dotPending: { backgroundColor: '#F59E0B' },
  hint: { fontSize: 12, color: MUTED },
  cap: { fontSize: 11, fontWeight: '700', color: MUTED },
  headRow: { flexDirection: 'row', gap: 8, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D4D4D8' },
  rowWrap: { paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ECECEF' },
  row: { flexDirection: 'row', gap: 8 },
  problem: { fontSize: 12.5, fontWeight: '600', color: '#B42318', backgroundColor: '#FEF3F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 2 },
  col: { width: 84 },
  name: { fontSize: 13, fontWeight: '700', color: INK },
  input: { height: 36, borderRadius: 9, borderWidth: 1, borderColor: '#D4D4D8', paddingHorizontal: 8, justifyContent: 'center', backgroundColor: '#FAFAFB' },
  inputText: { fontSize: 14, fontVariant: ['tabular-nums'], color: INK },
  inputActive: { borderColor: INK, borderWidth: 2 },
  inputChanged: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  inputError: { borderColor: '#F04438', backgroundColor: '#FEF3F2' },
  panel: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D4D4D8', gap: 4 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  link: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  panelBtns: { flexDirection: 'row', gap: 8 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center' },
  dayBtn: { width: 34, height: 30, borderRadius: 9, backgroundColor: '#F1F1F3', alignItems: 'center', justifyContent: 'center' },
  dayBtnText: { fontSize: 18, fontWeight: '800', color: INK, marginTop: -2 },
  dayText: { fontSize: 13.5, fontWeight: '700', color: INK, minWidth: 110, textAlign: 'center' },
  daySet: { fontSize: 11.5, fontWeight: '600', color: '#8A5200' },
  ghostBtn: { flex: 1, height: 40, borderRadius: 12, backgroundColor: '#F1F1F3', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  ghostText: { fontSize: 13, fontWeight: '700', color: INK },
  note: { fontSize: 10.5, color: '#8A5200', marginTop: 2 },
  btn: { height: 50, borderRadius: 14, backgroundColor: ACTION, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
