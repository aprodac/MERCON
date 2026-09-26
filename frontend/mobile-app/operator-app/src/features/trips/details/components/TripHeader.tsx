/** Who and where, at a glance: customer, trip number, status, what's happening now, stop progress. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ArrowRight, CircleAlert, Clock3, ExternalLink, Flag, XCircle } from 'lucide-react-native';
import { CompanyAvatar, niceName } from '../../create/components/ui';
import type { OperatorTripDetail, TripPhase } from '../../../../lib/operator';
import { TONE, delayText, sortedStops, statusChip, stopName, type Formatters, type Tone, statePhrase } from '../tripDetailsModel';
import { Card, Chip, INK, MUTED } from './parts';

const PHASE_TONE: Record<TripPhase, Tone> = { planned: 'violet', active: 'blue', done: 'green', cancelled: 'gray' };

export function TripHeader({ trip, phase, f }: { trip: OperatorTripDetail; phase: TripPhase; f: Formatters }) {
  const stops = sortedStops(trip);
  const chip = statusChip(trip.status);
  const phrase = statePhrase(trip, phase, f);
  const delayed = trip.status === 'Delayed' || trip.status === 'Emergency';
  const toneKey: Tone = delayed ? 'red' : PHASE_TONE[phase];
  const tone = TONE[toneKey];
  const PhraseIcon = delayed ? CircleAlert : phase === 'planned' ? Clock3 : phase === 'done' ? Flag : phase === 'cancelled' ? XCircle : ArrowRight;
  const nextIdx = phase === 'active' ? stops.findIndex((s) => !s.actual_arrival) : -1;
  const doneCount = stops.filter((s) => s.actual_arrival).length;
  const reported = [...stops].reverse().find((s) => s.delay_reason || s.delay_note);
  const route = stops.length
    ? stops.length <= 2
      ? stops.map((s, i) => stopName(s, i)).join(' → ')
      : `${stopName(stops[0], 0)} → +${stops.length - 2} → ${stopName(stops[stops.length - 1], stops.length - 1)}`
    : 'No stops';
  const caption =
    phase === 'planned' ? `${stops.length} stops planned`
    : phase === 'cancelled' ? 'Cancelled'
    : phase === 'done' ? `All ${stops.length} stops done`
    : `${doneCount} of ${stops.length} stops done`;

  return (
    <Card style={{ gap: 11 }}>
      <View style={s.top}>
        <CompanyAvatar name={trip.customer?.name} url={trip.customer?.logo_url} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.ref} numberOfLines={1} selectable>{trip.ref_id ?? trip.id.slice(0, 8)}</Text>
          <Text style={s.customer} numberOfLines={1}>{niceName(trip.customer?.name) || 'No customer'}</Text>
        </View>
        <Chip label={chip.label} tone={chip.tone} dot />
      </View>

      {phrase ? (
        <View style={[s.phrase, { backgroundColor: tone.bg }]}>
          <PhraseIcon size={15} color={tone.fg} strokeWidth={2.4} />
          <Text style={[s.phraseText, { color: tone.fg }]} numberOfLines={2}>
            {delayed ? `Delayed${reported ? ` · ${delayText(reported)}` : ''}` : phrase}
          </Text>
        </View>
      ) : null}

      {trip.driver_workflow === 'EXTERNAL_APP' ? (
        <View style={s.external}>
          <ExternalLink size={12} color={MUTED} />
          <Text style={s.externalText}>Driver uses the customer’s app · screenshots as proof</Text>
        </View>
      ) : null}

      {stops.length > 0 ? (
        <View style={{ gap: 6 }}>
          <View style={s.segments}>
            {stops.map((st, i) => (
              <View
                key={st.id}
                style={[
                  s.segment,
                  {
                    backgroundColor:
                      phase === 'cancelled' ? '#D6D3D1'
                      : phase === 'planned' ? '#DCD2F6'
                      : phase === 'done' || st.actual_arrival ? TONE.green.dot
                      : i === nextIdx ? TONE.blue.dot
                      : '#DDE0E8',
                  },
                ]}
              />
            ))}
          </View>
          <View style={s.captionRow}>
            <Text style={s.caption} numberOfLines={1}>{route}</Text>
            <Text style={s.captionStrong}>{caption}</Text>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  ref: { fontFamily: 'monospace', fontSize: 15, fontWeight: '700', color: INK },
  customer: { fontSize: 13, fontWeight: '600', color: INK, marginTop: 1 },
  phrase: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9 },
  phraseText: { flex: 1, fontSize: 13, fontWeight: '700' },
  external: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  externalText: { fontSize: 12, color: MUTED },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  captionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  caption: { flex: 1, fontSize: 12, color: MUTED },
  captionStrong: { fontSize: 12, fontWeight: '700', color: INK },
});
