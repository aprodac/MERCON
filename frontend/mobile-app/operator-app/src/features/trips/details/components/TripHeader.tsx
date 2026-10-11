/**
 * The trip at a glance, one card: who it's for and its status, one line on
 * what's happening now, stop progress while it's running, and the quick
 * actions. Each fact appears once — a finished trip shows "Finished …" and
 * nothing else about being done.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RotateCcw } from 'lucide-react-native';
import { CompanyAvatar, niceName } from '../../create/components/ui';
import type { OperatorTripDetail, TripPhase } from '../../../../lib/operator';
import { TONE, delayText, sortedStops, statusChip, stopName, tripLegsOf, type Formatters, type Tone, statePhrase } from '../tripDetailsModel';
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
  // A round trip shows its way out (Riyadh → Jeddah) and "back to Riyadh" — not first → last stop.
  const legs = tripLegsOf(trip);
  const name = (st: (typeof stops)[number] | undefined) => (st ? niceName(stopName(st, stops.indexOf(st))) : null);
  const outEnd = legs.round ? legs.outbound[legs.outbound.length - 1] : stops[stops.length - 1];
  const from = stops.length ? name(stops[0]) : null;
  const to = stops.length > 1 ? name(outEnd) : null;
  const back = legs.round ? name(legs.ret[legs.ret.length - 1]) || from : null;
  const via = legs.round ? Math.max(0, legs.outbound.length - 2) + Math.max(0, legs.ret.length - 2) : Math.max(0, stops.length - 2);
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

      {from ? (
        <View style={s.routeWrap}>
          <View style={s.routeBox}>
            <View style={s.rail}>
              <View style={[s.pin, { backgroundColor: '#FFFFFF', borderColor: INK }]} />
              {to ? <View style={s.railLine} /> : null}
              {to ? <View style={[s.pin, { backgroundColor: INK, borderColor: INK }]} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
              <Text style={s.route} numberOfLines={1}>{from}</Text>
              {to ? <Text style={s.route} numberOfLines={1}>{to}</Text> : null}
            </View>
            {via > 0 ? <Text style={s.via}>{`+${via} ${via === 1 ? 'stop' : 'stops'}`}</Text> : null}
          </View>
          {back ? (
            <View style={s.backRow}>
              <RotateCcw size={13} color={MUTED} strokeWidth={2.4} />
              <Text style={s.backText} numberOfLines={1}>{`Round trip · back to ${back}`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 4 }}>
        {now && !(delayed && !reported) ? <Text style={[s.now, { color: tone.fg }]}>{now}</Text> : null}
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
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  customer: { fontSize: 17, fontWeight: '700', color: INK, lineHeight: 22, letterSpacing: -0.2 },
  ref: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  routeWrap: { backgroundColor: '#F6F6F7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, gap: 8 },
  routeBox: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E9E9EC' },
  backText: { flex: 1, fontSize: 13, fontWeight: '600', color: MUTED },
  rail: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', paddingVertical: 4 },
  pin: { width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  railLine: { flex: 1, width: 2, backgroundColor: '#C9C9D1', marginVertical: 2 },
  route: { fontSize: 15, fontWeight: '600', color: INK, lineHeight: 20 },
  via: { fontSize: 12, fontWeight: '600', color: MUTED, backgroundColor: '#E9E9EC', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  now: { fontSize: 14, fontWeight: '600' },
  note: { fontSize: 12, color: MUTED },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
});
