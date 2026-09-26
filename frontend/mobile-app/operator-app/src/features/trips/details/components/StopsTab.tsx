/** Every stop in order: planned vs actual time, lateness, delay reason, photos, and screenshots to check. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Check, Clock3, Image as ImageIcon, Navigation, TriangleAlert } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { DriverUpdate, OperatorTripDetail, OperatorTripDocument, TripPhase } from '../../../../lib/operator';
import { ON_TIME_GRACE_MIN, TONE, delayText, mapsLink, minutesLate, sortedStops, stopName, type Formatters, type Stop } from '../tripDetailsModel';
import { Card, Chip, INK, MUTED } from './parts';

interface Props {
  trip: OperatorTripDetail;
  phase: TripPhase;
  updates: DriverUpdate[];
  f: Formatters;
  onOpenStopMedia: (stop: Stop) => void;
  onConfirmTime: (doc: OperatorTripDocument, stop: Stop) => void;
}

/** An external-app screenshot whose time the operator still has to confirm. */
export const pendingTimeCheck = (d: OperatorTripDocument) =>
  d.ai_extracted_json?.source === 'external_app_screenshot' && d.status === 'PendingReview';

export function StopsTab({ trip, phase, updates, f, onOpenStopMedia, onConfirmTime }: Props) {
  const stops = sortedStops(trip);
  const nextIdx = phase === 'active' ? stops.findIndex((s) => !s.actual_arrival) : -1;
  const docs = trip.documents ?? [];

  if (stops.length === 0) {
    return <Card><Text style={s.muted}>This trip has no stops.</Text></Card>;
  }

  return (
    <Card style={{ paddingVertical: 8 }}>
      {stops.map((st, i) => {
        const done = phase === 'done' || !!st.actual_arrival;
        const isNext = i === nextIdx;
        const last = i === stops.length - 1;
        const late = minutesLate(st.planned_arrival, st.actual_arrival);
        const delay = delayText(st);
        const media = updates.filter((u) => u.stop?.id === st.id).reduce((n, u) => n + u.items.length, 0);
        const check = docs.find((d) => pendingTimeCheck(d) && d.ai_extracted_json?.stop_id === st.id);
        const bubbleBg = phase === 'cancelled' ? '#D6D3D1' : done ? TONE.green.dot : isNext ? TONE.blue.dot : phase === 'planned' ? '#F5F2FD' : Colors.white;
        const bubbleBorder = done || isNext || phase === 'cancelled' ? 'transparent' : phase === 'planned' ? '#B7A6EC' : '#B8BCC8';
        const leg = (st.leg_index ?? 0) === 1 ? ' · return' : '';
        const times = st.actual_arrival
          ? `arrived ${f.smart(st.actual_arrival)}${st.actual_departure ? ` · left ${f.time(st.actual_departure)}` : ''}`
          : st.planned_arrival ? `due ${f.smart(st.planned_arrival)}` : 'no time planned';

        return (
          <View key={st.id} style={[s.row, isNext && s.rowNext]}>
            <View style={s.rail}>
              <View style={[s.bubble, { backgroundColor: bubbleBg, borderColor: bubbleBorder }, isNext && s.bubbleNext]}>
                {done ? <Check size={13} color={Colors.white} strokeWidth={3.2} /> : (
                  <Text style={[s.bubbleText, isNext && { color: Colors.white }, phase === 'planned' && { color: '#5B34B0' }]}>{i + 1}</Text>
                )}
              </View>
              {!last ? <View style={[s.line, { backgroundColor: done && phase !== 'cancelled' ? TONE.green.dot : '#DDE0E8' }]} /> : null}
            </View>

            <View style={[s.body, !last && { paddingBottom: 16 }]}>
              <View style={s.titleRow}>
                <Text style={[s.name, isNext && { fontWeight: '800' }]} numberOfLines={2}>{stopName(st, i)}</Text>
                {isNext ? <Chip label="Next" tone="blue" solid /> : late != null ? (
                  <Chip label={late > ON_TIME_GRACE_MIN ? `${late} min late` : 'On time'} tone={late > ON_TIME_GRACE_MIN ? 'red' : 'green'} />
                ) : null}
              </View>
              <Text style={s.muted}>{st.stop_type}{leg} · {times}</Text>

              {delay ? (
                <View style={s.delay}>
                  <TriangleAlert size={13} color="#912018" />
                  <Text style={s.delayText}>{delay}</Text>
                </View>
              ) : null}

              {check ? (
                <TouchableOpacity style={s.check} activeOpacity={0.8} onPress={() => onConfirmTime(check, st)}>
                  <Clock3 size={13} color="#8A5200" />
                  <Text style={s.checkText}>Screenshot time needs checking · tap to confirm</Text>
                </TouchableOpacity>
              ) : null}

              <View style={s.links}>
                {media > 0 ? (
                  <TouchableOpacity style={s.link} onPress={() => onOpenStopMedia(st)} hitSlop={6}>
                    <ImageIcon size={13} color="#2449A8" />
                    <Text style={s.linkText}>{media} {media === 1 ? 'photo' : 'photos'}</Text>
                  </TouchableOpacity>
                ) : null}
                {Number.isFinite(st.location_lat) && (st.location_lat || st.location_lng) ? (
                  <TouchableOpacity style={s.link} onPress={() => Linking.openURL(mapsLink(st.location_lat, st.location_lng)).catch(() => {})} hitSlop={6}>
                    <Navigation size={13} color="#2449A8" />
                    <Text style={s.linkText}>Directions</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const s = StyleSheet.create({
  muted: { fontSize: 12, color: MUTED, marginTop: 2 },
  row: { flexDirection: 'row', gap: 12, paddingTop: 8, marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 14 },
  rowNext: { backgroundColor: '#F3F6FD' },
  rail: { alignItems: 'center', width: 26 },
  bubble: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  bubbleNext: { shadowColor: '#2F5FD0', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 3 },
  bubbleText: { fontSize: 12, fontWeight: '800', color: MUTED },
  line: { flex: 1, width: 2, marginTop: 4, borderRadius: 1 },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: INK },
  delay: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 7, backgroundColor: '#FDEDEB', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  delayText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#912018' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, backgroundColor: '#FFF6E5', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  checkText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#8A5200' },
  links: { flexDirection: 'row', gap: 16, marginTop: 7 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: 12, fontWeight: '700', color: '#2449A8' },
});
