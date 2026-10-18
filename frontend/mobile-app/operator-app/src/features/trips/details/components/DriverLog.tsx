/**
 * Driver's log — a customer-app trip run as a trip log (shared-types tripLog):
 * the driver sends screenshots as the trip goes, with no stops. Each send shows
 * here with its time and place; the office makes it a stop, or adds it to a
 * stop the trip already has (LogStopSheet).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, TextInput, Alert } from 'react-native';
import { CircleCheck, MapPin, Plus, ListPlus } from 'lucide-react-native';
import { tripLogEntries, type TripLogEntry } from '@mercon/shared-types';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { operatorService, type OperatorTripDetail, type OperatorTripDocument } from '../../../../lib/operator';
import { sortedStops, stopName } from '../tripDetailsModel';
import { Card, INK, MUTED, SectionHead, tap } from './parts';

export type LogEntry = TripLogEntry<OperatorTripDocument>;

export const driverLogOf = (trip: OperatorTripDetail): LogEntry[] => tripLogEntries(trip.documents ?? []);

export function DriverLog({ trip, f, onOpen, onPick }: {
  trip: OperatorTripDetail;
  f: { time: (iso?: string | null) => string; smart: (iso?: string | null) => string };
  onOpen: (entry: LogEntry, index: number) => void;
  onPick: (entry: LogEntry) => void;
}) {
  const entries = useMemo(() => driverLogOf(trip), [trip]);
  const stops = useMemo(() => sortedStops(trip), [trip]);
  if (entries.length === 0) return null;
  const open = entries.filter((e) => !e.stop_id).length;

  return (
    <Card style={{ paddingVertical: 12, marginBottom: 12 }}>
      <SectionHead
        title={`Driver's log · ${entries.length} ${entries.length === 1 ? 'send' : 'sends'}`}
        right={open ? <Text style={s.open}>{open} not on a stop yet</Text> : <Text style={s.done}>All on stops</Text>}
      />
      <Text style={s.lead}>Stops weren{"'"}t known at booking. Turn each send into a stop, or add it to one.</Text>
      {entries.map((e, i) => {
        const stopIdx = e.stop_id ? stops.findIndex((st) => st.id === e.stop_id) : -1;
        return (
          <View key={e.id} style={[s.row, i > 0 && s.rowLine]}>
            {/* Time and place on the left, what happened to it on the right. */}
            <View style={s.head}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.time}>{f.smart(e.at)}</Text>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
              {e.docs.map((d, k) => (
                <TouchableOpacity key={d.id} onPress={() => { tap(); onOpen(e, k); }} activeOpacity={0.85}>
                  <Image source={{ uri: resolveMediaUrl(d.file_url) ?? undefined }} style={s.thumb} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );
      })}
    </Card>
  );
}

/** Make a log entry a new stop (name, loading / offloading), or add it to a stop the trip has. */
export function LogStopSheet({ trip, entry, f, onClose, onDone }: {
  trip: OperatorTripDetail;
  entry: LogEntry | null;
  f: { smart: (iso?: string | null) => string };
  onClose: () => void;
  onDone: () => void;
}) {
  const stops = useMemo(() => sortedStops(trip), [trip]);
  const [name, setName] = useState('');
  const [type, setType] = useState<'Pickup' | 'Dropoff'>('Dropoff');
  const [saving, setSaving] = useState(false);
  const [shownFor, setShownFor] = useState<LogEntry | null>(null);
  if (entry !== shownFor) {
    setShownFor(entry);
    if (entry) { setName(entry.place ?? ''); setType('Dropoff'); }
  }

  const save = async (body: { action: 'new'; name: string; stop_type: 'Pickup' | 'Dropoff' } | { action: 'attach'; stop_id: string }) => {
    if (!entry) return;
    setSaving(true);
    try {
      await operatorService.logEntryToStop(trip.id, entry.id, body);
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
        <Text style={s.cap}>New stop</Text>
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
          <Text style={[s.btnText, { color: '#fff' }]}>Make it a stop (arrived {f.smart(entry?.at)})</Text>
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
  open: { fontSize: 12, fontWeight: '800', color: '#B54708' },
  done: { fontSize: 12, fontWeight: '800', color: '#15803D' },
  lead: { fontSize: 12.5, color: MUTED, marginTop: 4, marginBottom: 6 },
  row: { paddingVertical: 10 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4E4E7' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { fontSize: 14, fontWeight: '800', color: INK },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  place: { fontSize: 12.5, color: MUTED, fontWeight: '600' },
  thumb: { width: 48, height: 72, borderRadius: 8, backgroundColor: '#F1F3F7', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E4E4E7' },
  onStop: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF3', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '55%' },
  onStopText: { fontSize: 12.5, fontWeight: '700', color: '#15803D' },
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
