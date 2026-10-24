/**
 * Driver's log — a customer-app trip run as a trip log (shared-types tripLog):
 * the driver sends screenshots as the trip goes, with no stops. Each send shows
 * here with its time and place; the office makes it a stop, or adds it to a
 * stop the trip already has (LogStopSheet).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, TextInput, Alert } from 'react-native';
import { ChevronDown, ChevronUp, CircleCheck, Clock3, MapPin, Plus, ListPlus, Sparkles } from 'lucide-react-native';
import { isoToWall, tripLogEntries, suggestForEntry, type TripLogEntry, type TripLogSuggestion } from '@mercon/shared-types';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { operatorService, type OperatorTripDetail, type OperatorTripDocument } from '../../../../lib/operator';
import { sortedStops, stopName } from '../tripDetailsModel';
import { Card, INK, MUTED, SectionHead, tap } from './parts';
import { TimeWheel } from './TimeWheel';

export type LogEntry = TripLogEntry<OperatorTripDocument>;

export const driverLogOf = (trip: OperatorTripDetail): LogEntry[] => tripLogEntries(trip.documents ?? []);

export function DriverLog({ trip, f, onOpen, onPick, onDone }: {
  trip: OperatorTripDetail;
  f: { time: (iso?: string | null) => string; smart: (iso?: string | null) => string };
  onOpen: (entry: LogEntry, index: number) => void;
  onPick: (entry: LogEntry) => void;
  onDone: () => void;
}) {
  const entries = useMemo(() => driverLogOf(trip), [trip]);
  const stops = useMemo(() => sortedStops(trip), [trip]);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  // What the screenshots say each open send is: a stop, LOAD / UNLOAD, arrived, left. Two sends never claim one stop.
  const suggestions = useMemo(() => {
    const out = new Map<string, TripLogSuggestion>();
    const taken = new Set(entries.map((e) => e.stop_id).filter((x): x is string => !!x));
    let openIndex = 0;
    for (const e of entries) {
      if (e.stop_id) continue;
      const sg = suggestForEntry(e, stops, { taken, openIndex });
      openIndex += 1;
      if (!sg) continue;
      if (sg.stop_id) taken.add(sg.stop_id);
      out.set(e.id, sg);
    }
    return out;
  }, [entries, stops]);
  if (entries.length === 0) return null;

  const confirm = async (e: LogEntry, sg: TripLogSuggestion) => {
    setConfirming(e.id);
    try {
      const times = { arrive_at: sg.arrive_at ?? undefined, depart_at: sg.depart_at ?? undefined, needs_check: sg.needs_check };
      await operatorService.logEntryToStop(trip.id, e.id, sg.action === 'attach' && sg.stop_id
        ? { action: 'attach', stop_id: sg.stop_id, ...times }
        : { action: 'new', name: sg.name, stop_type: sg.stop_type, ...times });
      onDone();
    } catch (err) {
      Alert.alert('Could not save', getApiErrorMessage(err));
    } finally {
      setConfirming(null);
    }
  };
  const open = entries.filter((e) => !e.stop_id).length;

  // Every send already on a stop: nothing left to do here, so one line (its screenshots are under the stops).
  if (open === 0 && !expanded) {
    return (
      <TouchableOpacity style={s.folded} onPress={() => { tap(); setExpanded(true); }} activeOpacity={0.8} accessibilityRole="button">
        <CircleCheck size={16} color="#15803D" />
        <Text style={s.foldedText} numberOfLines={1}>{"Driver's log"} · {entries.length} {entries.length === 1 ? 'send' : 'sends'} · all on stops</Text>
        <ChevronDown size={16} color={MUTED} />
      </TouchableOpacity>
    );
  }

  return (
    <Card style={{ paddingVertical: 12, marginBottom: 12 }}>
      <SectionHead
        title={`Driver's log · ${entries.length} ${entries.length === 1 ? 'send' : 'sends'}`}
        right={open ? <Text style={s.open}>{open} not on a stop yet</Text> : (
          <TouchableOpacity onPress={() => setExpanded(false)} hitSlop={8} style={s.hide} accessibilityRole="button">
            <Text style={s.done}>All on stops</Text>
            <ChevronUp size={14} color="#15803D" />
          </TouchableOpacity>
        )}
      />
      <Text style={s.lead}>Stops weren{"'"}t known at booking. Turn each send into a stop, or add it to one.</Text>
      {entries.map((e, i) => {
        const stopIdx = e.stop_id ? stops.findIndex((st) => st.id === e.stop_id) : -1;
        return (
          <View key={e.id} style={[s.row, i > 0 && s.rowLine]}>
            {/* Time and place on the left, what happened to it on the right. */}
            <View style={s.head}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {/* Numbered in the order sent (owner, 23 Oct). */}
                <Text style={s.time}><Text style={s.num}>#{i + 1}</Text>{'  '}{f.smart(e.at)}</Text>
                {e.place ? (
                  <View style={s.placeRow}>
                    <MapPin size={12} color={MUTED} />
                    <Text style={s.place} numberOfLines={1}>near {e.place} · {e.docs.length} screenshot{e.docs.length === 1 ? '' : 's'}</Text>
                  </View>
                ) : <Text style={s.place}>{e.docs.length} screenshot{e.docs.length === 1 ? '' : 's'}</Text>}
              </View>
              {stopIdx >= 0 ? (
                <View style={s.onStop}>
                  <CircleCheck size={13} color="#15803D" />
                  <Text style={s.onStopText} numberOfLines={1}>Stop {stopIdx + 1} · {stopName(stops[stopIdx], stopIdx)}</Text>
                </View>
              ) : (
                <TouchableOpacity style={s.btn} onPress={() => { tap(); onPick(e); }} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Make a stop or add to one">
                  <Plus size={14} color={INK} />
                  <Text style={s.btnText}>Make stop</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* Read off the screenshots: one tap makes the stop and saves both times. Nothing is saved until then. */}
            {stopIdx < 0 && suggestions.get(e.id) ? (() => {
              const sg = suggestions.get(e.id)!;
              return (
                <View style={s.suggest}>
                  <Sparkles size={14} color="#5B34B0" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.suggestText} numberOfLines={2}>
                      Suggested: {sg.stop_index != null ? `Stop ${sg.stop_index + 1} · ` : 'New stop · '}{sg.name} · {sg.stop_type === 'Pickup' ? 'LOAD' : 'UNLOAD'}
                      {sg.arrive_at ? ` · Arrived ${f.time(sg.arrive_at)}` : ''}{sg.depart_at ? ` · Left ${f.time(sg.depart_at)}` : ''}
                    </Text>
                    {sg.needs_check ? <Text style={s.suggestCheck}>Not sure — check the screenshot, the time stays to confirm</Text> : null}
                  </View>
                  <TouchableOpacity style={[s.btn, s.confirmBtn, confirming === e.id && { opacity: 0.5 }]} disabled={confirming !== null} onPress={() => { tap(); void confirm(e, sg); }} accessibilityRole="button" accessibilityLabel="Confirm the suggested stop and times">
                    <Text style={[s.btnText, { color: '#fff' }]}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              );
            })() : null}
            {/* Screenshots only while the send waits for a stop — once on one, they show under that stop. */}
            {/* "Edit time" beside the screenshots (TestFlight 24 Oct): opens the stop sheet with the time to set. */}
            {stopIdx >= 0 ? null : (
            <View style={s.thumbRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
                {e.docs.map((d, k) => (
                  <TouchableOpacity key={d.id} onPress={() => { tap(); onOpen(e, k); }} activeOpacity={0.85}>
                    <Image source={{ uri: resolveMediaUrl(d.file_url) ?? undefined }} style={s.thumb} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={[s.btn, s.timeBtn]} onPress={() => { tap(); onPick(e); }} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Edit the time of send ${i + 1}`}>
                <Clock3 size={14} color="#7C2D12" />
                <Text style={[s.btnText, { color: '#7C2D12' }]}>Edit time</Text>
              </TouchableOpacity>
            </View>
            )}
          </View>
        );
      })}
    </Card>
  );
}

/** Make a log entry a new stop (name, loading / offloading), or add it to a stop the trip has. */
export function LogStopSheet({ trip, entry, f, tz, onClose, onDone }: {
  trip: OperatorTripDetail;
  entry: LogEntry | null;
  f: { smart: (iso?: string | null) => string };
  tz: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const stops = useMemo(() => sortedStops(trip), [trip]);
  const [name, setName] = useState('');
  const [type, setType] = useState<'Pickup' | 'Dropoff'>('Dropoff');
  const [saving, setSaving] = useState(false);
  // The arrival time this send stands for: the send's time unless the office sets another.
  const [arrive, setArrive] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [shownFor, setShownFor] = useState<LogEntry | null>(null);
  if (entry !== shownFor) {
    setShownFor(entry);
    setArrive(null);
    setEditingTime(false);
    if (entry) { setName(entry.place ?? ''); setType('Dropoff'); }
  }
  const arrivedAt = arrive ?? entry?.at ?? null;
  /** Same day as the send, another clock time (the wheel only turns the clock). */
  const withClock = (clock: string) => {
    if (!entry) return;
    const was = isoToWall(entry.at, tz).clock;
    const secs = (c: string) => { const [h = 0, m = 0, sec = 0] = c.split(':').map((x) => Number(x) || 0); return h * 3600 + m * 60 + sec; };
    setArrive(new Date(new Date(entry.at).getTime() + (secs(clock) - secs(was)) * 1000).toISOString());
  };

  const save = async (body: { action: 'new'; name: string; stop_type: 'Pickup' | 'Dropoff' } | { action: 'attach'; stop_id: string }) => {
    if (!entry) return;
    setSaving(true);
    try {
      // Only a time the office set is sent: it is then saved as the stop's arrival.
      await operatorService.logEntryToStop(trip.id, entry.id, arrive ? { ...body, arrive_at: arrive } : body);
      onDone();
      onClose();
    } catch (e) {
      Alert.alert('Could not save', getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal visible={!!entry} onClose={onClose} type="bottom-sheet" title={entry ? `Send of ${f.smart(entry.at)}` : ''} maxHeight="90%">
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={s.cap}>Arrived</Text>
        <TouchableOpacity style={s.timeRow} onPress={() => setEditingTime((v) => !v)} activeOpacity={0.8} accessibilityRole="button">
          <Clock3 size={16} color={INK} />
          <Text style={s.timeValue}>{arrivedAt ? f.smart(arrivedAt) : '—'}</Text>
          {arrive ? <Text style={s.timeNote}>set by you</Text> : <Text style={s.timeNote}>when it was sent</Text>}
          <View style={{ flex: 1 }} />
          <Text style={s.add}>{editingTime ? 'Done' : 'Edit time'}</Text>
        </TouchableOpacity>
        {editingTime && entry ? (
          <View style={{ marginBottom: 6 }}>
            <TimeWheel value={isoToWall(arrivedAt ?? entry.at, tz).clock} onChange={withClock} />
            {arrive ? (
              <TouchableOpacity onPress={() => setArrive(null)} hitSlop={8} style={{ alignSelf: 'center', marginTop: 6 }}>
                <Text style={[s.add, { color: MUTED }]}>Use the send time</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        <Text style={[s.cap, { marginTop: 14 }]}>New stop</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Place name, e.g. Taif" style={s.input} placeholderTextColor="#A1A1AA" />
        <View style={s.seg}>
          {([['Pickup', 'Loading'], ['Dropoff', 'Offloading']] as const).map(([v, label]) => (
            <TouchableOpacity key={v} style={[s.segBtn, type === v && s.segOn]} onPress={() => setType(v)} accessibilityRole="radio" accessibilityState={{ selected: type === v }}>
              <Text style={[s.segText, type === v && s.segTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[s.btn, s.bigBtn, (saving || !name.trim()) && { opacity: 0.5 }]}
          disabled={saving || !name.trim()}
          onPress={() => save({ action: 'new', name: name.trim(), stop_type: type })}
        >
          <ListPlus size={16} color="#fff" />
          <Text style={[s.btnText, { color: '#fff' }]}>Make it a stop (arrived {f.smart(arrivedAt)})</Text>
        </TouchableOpacity>

        <Text style={[s.cap, { marginTop: 18 }]}>Or add to a stop on the trip</Text>
        {stops.map((st, i) => (
          <TouchableOpacity key={st.id} style={s.stopRow} disabled={saving} onPress={() => save({ action: 'attach', stop_id: st.id })}>
            <Text style={s.stopNo}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.stopName} numberOfLines={1}>{stopName(st, i)}</Text>
              <Text style={s.stopSub}>{st.stop_type === 'Pickup' ? 'Loading' : 'Offloading'}{st.actual_arrival ? ` · arrived ${f.smart(st.actual_arrival)}` : ''}</Text>
            </View>
            <Text style={s.add}>Add</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </AppModal>
  );
}

const s = StyleSheet.create({
  open: { fontSize: 12, fontWeight: '800', color: '#B42318' },
  folded: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E4E4E7', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  foldedText: { flex: 1, fontSize: 13.5, fontWeight: '700', color: INK },
  hide: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  done: { fontSize: 12, fontWeight: '800', color: '#15803D' },
  lead: { fontSize: 12.5, color: MUTED, marginTop: 4, marginBottom: 6 },
  row: { paddingVertical: 10 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4E4E7' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { fontSize: 14, fontWeight: '800', color: INK },
  num: { color: '#C4432F', fontWeight: '800' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  place: { fontSize: 12.5, color: MUTED, fontWeight: '600' },
  thumbRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  timeBtn: { backgroundColor: '#FFEDD5', borderColor: '#FED7AA' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8 },
  timeValue: { fontSize: 15, fontWeight: '800', color: INK },
  timeNote: { fontSize: 12, color: MUTED },
  thumb: { width: 48, height: 72, borderRadius: 8, backgroundColor: '#F1F3F7', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E4E4E7' },
  onStop: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF3', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '55%' },
  onStopText: { fontSize: 12.5, fontWeight: '700', color: '#15803D' },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F2FD', borderRadius: 12, padding: 10, marginTop: 8 },
  suggestText: { fontSize: 13, fontWeight: '700', color: INK },
  suggestCheck: { fontSize: 11.5, fontWeight: '600', color: '#B54708', marginTop: 2 },
  confirmBtn: { backgroundColor: INK, borderWidth: 0 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#D4D4D8', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  bigBtn: { alignSelf: 'stretch', paddingVertical: 13, marginTop: 10, backgroundColor: INK, borderWidth: 0, borderRadius: 12 },
  btnText: { color: INK, fontSize: 13, fontWeight: '800' },
  cap: { fontSize: 12, fontWeight: '800', color: MUTED, textTransform: 'uppercase', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: INK },
  seg: { flexDirection: 'row', backgroundColor: '#F1F1F3', borderRadius: 12, padding: 3, marginTop: 10 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: '#fff' },
  segText: { fontSize: 14, fontWeight: '700', color: MUTED },
  segTextOn: { color: INK },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4E4E7' },
  stopNo: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#F1F1F3', textAlign: 'center', lineHeight: 24, fontWeight: '800', color: INK, overflow: 'hidden' },
  stopName: { fontSize: 14, fontWeight: '700', color: INK },
  stopSub: { fontSize: 12, color: MUTED },
  add: { fontSize: 13, fontWeight: '800', color: '#2563EB' },
});
