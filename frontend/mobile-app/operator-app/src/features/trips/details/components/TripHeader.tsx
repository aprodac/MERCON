/**
 * The trip at a glance, one card: who it's for and its status, one line on
 * what's happening now, stop progress while it's running, and the quick
 * actions. Each fact appears once — a finished trip shows "Finished …" and
 * nothing else about being done.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CompanyAvatar, niceName } from '../../create/components/ui';
import type { OperatorTripDetail, TripPhase } from '../../../../lib/operator';
import { TONE, delayText, sortedStops, statusChip, stopName, type Formatters, type Tone, statePhrase } from '../tripDetailsModel';
import { Card, Chip, INK, MUTED } from './parts';

const PHASE_TONE: Record<TripPhase, Tone> = { planned: 'violet', active: 'blue', done: 'green', cancelled: 'gray' };

export function TripHeader({ trip, phase, f, children }: { trip: OperatorTripDetail; phase: TripPhase; f: Formatters; children?: React.ReactNode }) {
  const stops = sortedStops(trip);
  const chip = statusChip(trip.status);
  const phrase = statePhrase(trip, phase, f);
  const delayed = trip.status === 'Delayed' || trip.status === 'Emergency';
  const tone = TONE[delayed ? 'red' : PHASE_TONE[phase]];
  const nextIdx = phase === 'active' ? stops.findIndex((s) => !s.actual_arrival) : -1;
  const doneCount = stops.filter((s) => s.actual_arrival).length;
  const reported = [...stops].reverse().find((s) => s.delay_reason || s.delay_note);
  const from = stops.length ? niceName(stopName(stops[0], 0)) : null;
  const to = stops.length > 1 ? niceName(stopName(stops[stops.length - 1], stops.length - 1)) : null;
  const via = Math.max(0, stops.length - 2);
  const now = delayed ? `Delayed${reported ? ` · ${delayText(reported)}` : ''}` : phrase;
  // Progress only means something while the trip is running.
  const showProgress = phase === 'active' && stops.length > 0;

  return (
    <Card style={{ gap: 14 }}>
      <View style={s.top}>
        <CompanyAvatar name={trip.customer?.name} url={trip.customer?.logo_url} size={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={s.customer} numberOfLines={2}>{niceName(trip.customer?.name) || 'No customer'}</Text>
          <Text style={s.ref} selectable>{trip.ref_id ?? trip.id.slice(0, 8)}</Text>
        </View>
        <Chip label={chip.label} tone={chip.tone} dot />
      </View>

      <View style={{ gap: 6 }}>
        {from ? (
          <Text style={s.route}>
            {from}
            {to ? <Text style={s.arrow}>{'  →  '}</Text> : null}
            {to}
            {via > 0 ? <Text style={s.via}>{`   +${via} ${via === 1 ? 'stop' : 'stops'}`}</Text> : null}
          </Text>
        ) : null}
        {now ? <Text style={[s.now, { color: tone.fg }]}>{now}</Text> : null}
        {trip.driver_workflow === 'EXTERNAL_APP' ? <Text style={s.note}>Driver uses the customer’s app · screenshots as proof</Text> : null}
      </View>

      {showProgress ? (
        <View style={{ gap: 6 }}>
          <View style={s.segments}>
            {stops.map((st, i) => (
              <View key={st.id} style={[s.segment, { backgroundColor: st.actual_arrival ? TONE.green.dot : i === nextIdx ? (delayed ? TONE.red.dot : TONE.blue.dot) : '#E4E4E7' }]} />
            ))}
          </View>
          <Text style={s.note}>{doneCount} of {stops.length} stops done</Text>
        </View>
      ) : null}

      {children}
    </Card>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  customer: { fontSize: 17, fontWeight: '700', color: INK, lineHeight: 22, letterSpacing: -0.2 },
  ref: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  route: { fontSize: 15, fontWeight: '600', color: INK, lineHeight: 21 },
  arrow: { color: '#A1A1AA', fontWeight: '400' },
  via: { fontSize: 13, fontWeight: '500', color: MUTED },
  now: { fontSize: 14, fontWeight: '600' },
  note: { fontSize: 12, color: MUTED },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
});
