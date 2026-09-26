/** The trip's route with an arrival time at every stop, the drive between them and time spent at each. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CircleAlert, Timer, Truck } from 'lucide-react-native';
import { Colors, Spacing } from '@mercon/mobile-shared/theme/tokens';
import type { RouteEstimate, RoutePoint } from '../routeEstimate';
import { Section, SkeletonRows, niceName } from './ui';

const ROLE: Record<RoutePoint['kind'], string> = {
  pickup: 'Pickup',
  stop: 'Stop',
  dropoff: 'Drop-off',
  returnPickup: 'Return loading',
  returnStop: 'Return stop',
  finalDrop: 'Final drop-off',
};

const dur = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h ? `${h} h` : ''}${h && m ? ' ' : ''}${m || !h ? `${m} min` : ''}`;
};

/** "08:00" + minutes → "HH:MM" and how many days later. */
function clock(start: string, plus: number): { time: string; days: number } {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + Math.round(plus);
  return { time: `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`, days: Math.floor(total / 1440) };
}

export function RouteTiming({ eta, pending, startTime, dutyMinutes }: { eta: RouteEstimate | null; pending: boolean; startTime?: string; dutyMinutes?: number | null }) {
  if (!eta) {
    return pending ? (
      <Section icon={Timer} tone="violet" title="Route timing">
        <SkeletonRows rows={3} height={34} />
      </Section>
    ) : null;
  }

  // Minutes from pickup to arriving at each point.
  const arrive: number[] = [0];
  for (let i = 0; i < eta.legs.length; i++) arrive.push(arrive[i] + eta.dwell[i] + eta.legs[i].minutes);

  const color = (p: RoutePoint) =>
    p.kind === 'pickup' || p.kind === 'returnPickup' ? Colors.success : p.kind === 'dropoff' || p.kind === 'finalDrop' ? Colors.primary : Colors.gray400;
  const isReturn = (p: RoutePoint) => p.kind === 'returnPickup' || p.kind === 'returnStop' || p.kind === 'finalDrop';
  const unknown = eta.points.filter((p) => !p.coords).map((p) => niceName(p.name));

  return (
    <Section icon={Timer} tone="violet" title="Route timing">
      <View style={styles.list}>
        <View style={styles.rail} />
        {eta.points.map((p, i) => {
          const at = startTime ? clock(startTime, arrive[i]) : null;
          const leg = eta.legs[i];
          const stay = eta.dwell[i];
          return (
            <View key={`${p.kind}-${i}`}>
              <View style={styles.point}>
                <View style={[styles.dot, { backgroundColor: color(p) }, (p.kind === 'stop' || p.kind === 'returnStop') && styles.dotSmall, isReturn(p) && { opacity: 0.7 }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {niceName(p.name)}
                  </Text>
                  <Text style={styles.role}>
                    {ROLE[p.kind]}
                    {p.alsoReturnPickup ? ' · load for return' : ''}
                    {!p.coords ? ' · not on the map' : ''}
                  </Text>
                </View>
                {at ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.time}>
                      {at.time}
                      {at.days > 0 ? <Text style={styles.plusDay}>{`  +${at.days}d`}</Text> : null}
                    </Text>
                    <Text style={styles.timeCap}>{i === 0 ? 'leave' : 'arrive'}</Text>
                  </View>
                ) : null}
              </View>
              {stay > 0 ? (
                <Text style={styles.stay}>
                  {stay} min at this stop{at ? ` · leave ${clock(startTime!, arrive[i] + stay).time}` : ''}
                </Text>
              ) : null}
              {leg ? (
                <View style={styles.leg}>
                  {leg.source === 'unknown' ? <CircleAlert size={13} color={Colors.warning} /> : <Truck size={13} color={Colors.gray500} />}
                  <Text style={[styles.legText, leg.source === 'unknown' && { color: Colors.warning }]}>
                    {leg.source === 'unknown' ? `${dur(leg.minutes)} assumed` : `${dur(leg.minutes)}${leg.km != null ? ` · ${leg.km} km` : ''}`}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.total}>
        <Text style={styles.totalLabel}>Whole trip</Text>
        <Text style={styles.totalValue}>
          {dur(eta.totalMinutes)}
          {eta.totalKm != null ? <Text style={styles.totalKm}>{`  ·  ${eta.totalKm} km`}</Text> : null}
        </Text>
      </View>
      <Text style={styles.note}>
        {eta.source === 'road' ? 'Road driving times from the map service' : eta.source === 'mixed' ? 'Partly road times, partly approximate' : 'Approximate times from the distance between places'}
        {eta.dwell.some((d) => d > 0) ? `, plus ${eta.dwell.find((d) => d > 0)} min at each stop.` : '.'}
        {dutyMinutes ? ` The drop-off follows the ${dutyMinutes / 60}-hour duty, not the drive.` : ''}
      </Text>
      {unknown.length ? (
        <Text style={[styles.note, { color: Colors.warning }]}>
          {unknown.join(', ')} {unknown.length > 1 ? 'are' : 'is'} not on the map — pick a saved place with a location for a better estimate.
        </Text>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  list: { position: 'relative', paddingLeft: 20 },
  rail: { position: 'absolute', left: 5, top: 12, bottom: 12, borderLeftWidth: 1.5, borderColor: Colors.gray300, borderStyle: 'dashed' },
  point: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  dot: { position: 'absolute', left: -20, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.white },
  dotSmall: { left: -18, width: 8, height: 8, borderWidth: 0 },
  name: { fontSize: 14, fontWeight: '700', color: Colors.charcoal },
  role: { fontSize: 11, color: Colors.gray500, marginTop: 1 },
  time: { fontSize: 16, fontWeight: '800', color: Colors.charcoal },
  plusDay: { fontSize: 11, fontWeight: '700', color: Colors.warning },
  timeCap: { fontSize: 10, color: Colors.gray400 },
  stay: { fontSize: 11, color: Colors.gray600, marginBottom: 2 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, marginVertical: 2, alignSelf: 'flex-start', borderRadius: 999, backgroundColor: Colors.gray100 },
  legText: { fontSize: 12, fontWeight: '600', color: Colors.gray600 },
  total: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.gray100 },
  totalLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600 },
  totalValue: { fontSize: 16, fontWeight: '800', color: Colors.charcoal },
  totalKm: { fontSize: 12, fontWeight: '600', color: Colors.gray500 },
  note: { fontSize: 11, color: Colors.gray500, marginTop: 6, lineHeight: 16 },
});
