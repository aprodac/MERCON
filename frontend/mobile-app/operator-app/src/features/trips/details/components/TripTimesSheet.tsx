/**
 * Copy a customer-app trip's real stop times off the driver's screenshots, all
 * stops in one pass. The customer's app lists every stop's arrive / departure
 * time on one screen, so the rows follow the same order: the operator taps a
 * time, rolls the hour / minute / second wheels to the screenshot's value and
 * hits "Next" to move on. An untouched time keeps the driver's tapped time.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, ScrollView } from 'react-native';
import { isoToWall, resolveStopTimes, type StopTimeRow } from '@mercon/shared-types';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { operatorService, type OperatorTripDetail, type OperatorTripDocument } from '../../../../lib/operator';
import { sortedStops, stopName } from '../tripDetailsModel';
import { ACTION, INK, MUTED } from './parts';
import { TimeWheel } from './TimeWheel';

/** A screenshot from the customer's app (EXTERNAL_APP trips). */
export const isAppScreenshot = (d: OperatorTripDocument) => d.ai_extracted_json?.source === 'external_app_screenshot';
/** …whose times the operator still has to check. */
export const pendingTimeCheck = (d: OperatorTripDocument) => isAppScreenshot(d) && d.status === 'PendingReview';

interface Props {
  visible: boolean;
  trip: OperatorTripDetail;
  tz: string;
  onClose: () => void;
  onDone: () => void;
}

type Field = 'arrival' | 'departure';
const FIELDS: Field[] = ['arrival', 'departure'];
const FIELD_LABEL: Record<Field, string> = { arrival: 'Arrived', departure: 'Left' };

export function TripTimesSheet({ visible, trip, tz, onClose, onDone }: Props) {
  const stops = useMemo(() => sortedStops(trip), [trip]);
  const shots = useMemo(
    () => (trip.documents ?? []).filter(isAppScreenshot).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [trip.documents],
  );
  const pending = shots.filter(pendingTimeCheck).length;

  const [typed, setTyped] = useState<Record<string, Record<Field, string>>>({});
  const [shotIdx, setShotIdx] = useState(0);
  const [tall, setTall] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Which time the wheels are editing: index into stops × FIELDS. */
  const [active, setActive] = useState<number | null>(null);

  // Start clean each time the sheet opens.
  const [shownFor, setShownFor] = useState(false);
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) { setTyped({}); setShotIdx(0); setTall(false); setActive(null); }
  }

  const rows: StopTimeRow[] = stops.map((s) => ({
    stopId: s.id,
    recordedArrival: s.actual_arrival,
    recordedDeparture: s.actual_departure,
    arrival: typed[s.id]?.arrival ?? '',
    departure: typed[s.id]?.departure ?? '',
  }));
  const fallback = trip.actual_start || trip.planned_start || stops[0]?.planned_arrival || new Date().toISOString();
  const resolved = resolveStopTimes(rows, tz, fallback);
  const hasError = resolved.some((r) => r.arrival.error || r.departure.error);
  const changes = resolved.filter((r) => r.arrival.changed || r.departure.changed);

  const clock = (iso: string | null) => (iso ? isoToWall(iso, tz).clock : null);

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
  const lastIdx = stops.length * 2 - 1;

  const confirm = async () => {
    if (hasError) return;
    setSaving(true);
    try {
      await operatorService.confirmTripTimes(trip.id, changes.map((c) => ({
        stop_id: c.stopId,
        ...(c.arrival.changed && c.arrival.iso ? { actual_arrival: c.arrival.iso } : {}),
        ...(c.departure.changed && c.departure.iso ? { actual_departure: c.departure.iso } : {}),
      })));
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
          <TouchableOpacity activeOpacity={0.9} onPress={() => { if (active !== null) { setActive(null); setTall(true); } else setTall((t) => !t); }}>
            <Image source={{ uri: shotUrl }} style={[s.shot, tall && active === null && s.shotTall]} resizeMode="contain" />
          </TouchableOpacity>
          <View style={s.shotBar}>
            <Text style={s.hint} numberOfLines={1}>
              {shotStop >= 0 ? stopName(stops[shotStop], shotStop) : 'Trip'} · tap to {tall && active === null ? 'shrink' : 'enlarge'}
            </Text>
            {shots.length > 1 ? (
              <View style={s.pager}>
                {shots.map((d, i) => (
                  <TouchableOpacity key={d.id} onPress={() => setShotIdx(i)} hitSlop={6}>
                    <View style={[s.dot, i === shotIdx && s.dotOn, pendingTimeCheck(d) && i !== shotIdx && s.dotPending]} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      <ScrollView style={{ marginTop: 10 }} keyboardShouldPersistTaps="handled">
        <View style={s.headRow}>
          <Text style={[s.cap, { flex: 1 }]}>Stop</Text>
          <Text style={[s.cap, s.col]}>Arrived</Text>
          <Text style={[s.cap, s.col]}>Left</Text>
        </View>
        {stops.map((st, i) => {
          const r = resolved[i];
          return (
            <View key={st.id} style={s.row}>
              <View style={{ flex: 1, minWidth: 0, paddingTop: 7 }}>
                <Text style={s.name} numberOfLines={1}>{stopName(st, i)}</Text>
                <Text style={s.hint} numberOfLines={1}>
                  {st.actual_arrival ? `tapped ${clock(st.actual_arrival)?.slice(0, 5)}${st.actual_departure ? `–${clock(st.actual_departure)?.slice(0, 5)}` : ''}` : 'not reached'}
                </Text>
              </View>
              {FIELDS.map((field, f) => {
                const t = r[field];
                const recorded = field === 'arrival' ? st.actual_arrival : st.actual_departure;
                const idx = i * 2 + f;
                const value = typed[st.id]?.[field] || clock(recorded);
                return (
                  <View key={field} style={s.col}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setActive(active === idx ? null : idx)}
                      accessibilityLabel={`${stopName(st, i)} ${FIELD_LABEL[field]}`}
                      style={[s.input, t.changed && s.inputChanged, !!t.error && s.inputError, active === idx && s.inputActive]}
                    >
                      <Text style={[s.inputText, !typed[st.id]?.[field] && { color: '#A1A1AA' }]}>{value ?? 'set'}</Text>
                    </TouchableOpacity>
                    <Text style={[s.note, !!t.error && { color: '#B42318' }]} numberOfLines={1}>
                      {t.error ?? (t.changed ? [recorded ? `was ${clock(recorded)?.slice(0, 5)}` : 'new', t.dayOffset ? `+${t.dayOffset}d` : ''].filter(Boolean).join(' · ') : ' ')}
                    </Text>
                  </View>
                );
              })}
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
        const next = active < lastIdx ? active + 1 : null;
        return (
          <View style={s.panel}>
            <View style={s.panelHead}>
              <Text style={s.name} numberOfLines={1}>{stopName(st, i)} · {FIELD_LABEL[field]}</Text>
              {picked ? (
                <TouchableOpacity onPress={() => set(st.id, field, '')} hitSlop={8}>
                  <Text style={s.link}>{recorded ? `Undo · tapped ${clock(recorded)}` : 'Clear'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TimeWheel key={active} value={wheelStart(active)} onChange={(v) => set(st.id, field, v)} />
            <View style={s.panelBtns}>
              <TouchableOpacity style={s.ghostBtn} onPress={() => setActive(null)}>
                <Text style={s.ghostText}>Done</Text>
              </TouchableOpacity>
              {next !== null ? (
                <TouchableOpacity style={[s.ghostBtn, { flex: 2 }]} onPress={() => setActive(next)}>
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
          {pending > 0 ? `${pending} screenshot${pending === 1 ? '' : 's'} to check` : 'All screenshots checked'} · tap a time to change it · untouched times stay as tapped
        </Text>
      )}
      <TouchableOpacity style={[s.btn, (saving || hasError) && { opacity: 0.5 }]} onPress={confirm} disabled={saving || hasError}>
        <Text style={s.btnText}>
          {saving ? 'Saving…' : changes.length ? `Save ${changes.length} stop${changes.length === 1 ? '' : 's'}` : 'Times are right'}
        </Text>
      </TouchableOpacity>
    </AppModal>
  );
}

const s = StyleSheet.create({
  shot: { width: '100%', height: 200, borderRadius: 14, backgroundColor: '#F1F3F7' },
  shotTall: { height: 440 },
  shotBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pager: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D4D4D8' },
  dotOn: { backgroundColor: INK },
  dotPending: { backgroundColor: '#F59E0B' },
  hint: { fontSize: 12, color: MUTED },
  cap: { fontSize: 11, fontWeight: '700', color: MUTED },
  headRow: { flexDirection: 'row', gap: 8, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D4D4D8' },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ECECEF' },
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
  ghostBtn: { flex: 1, height: 40, borderRadius: 12, backgroundColor: '#F1F1F3', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  ghostText: { fontSize: 13, fontWeight: '700', color: INK },
  note: { fontSize: 10.5, color: '#8A5200', marginTop: 2 },
  btn: { height: 50, borderRadius: 14, backgroundColor: ACTION, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
