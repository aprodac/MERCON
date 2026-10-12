/** The trip's route: planned arrival at every stop next to the drive-only ETA, the drive between them and time spent at each. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CircleAlert, Pencil, Timer, Truck } from 'lucide-react-native';
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

/** A time the operator plans (drop-off, return loading, arrival home), in minutes after pickup. */
export interface PlannedTime {
  /** Minutes after pickup; null while not set. */
  at: number | null;
  /** Still the automatic fill from the drive time, not set by the operator. */
  auto?: boolean;
  onEdit: () => void;
}

/**
 * Two different things per stop: the planned time the operator sets (drive,
 * rest, breaks — editable here), and the drive-only ETA from the map. Every
 * stop after a planned one is timed from the plan, so the drive-only ETA there
 * is what the road allows after it.
 *
 * `returnLoadAt`: a round trip's return loading, in minutes after pickup. The
 * way back is then timed from it (with the wait shown) instead of straight
 * after the drop-off.
 */
export function RouteTiming({
  eta,
  pending,
  startTime,
  dutyMinutes,
  returnLoadAt,
  onEditPickup,
  plannedDropoff,
  plannedReturnLoad,
  plannedHome,
}: {
  eta: RouteEstimate | null;
  pending: boolean;
  startTime?: string;
  dutyMinutes?: number | null;
  returnLoadAt?: number | null;
  onEditPickup?: () => void;
  plannedDropoff?: PlannedTime;
  plannedReturnLoad?: PlannedTime;
  plannedHome?: PlannedTime;
}) {
  if (!eta) {
    return pending ? (
      <Section icon={Timer} tone="violet" title="Route timing">
        <SkeletonRows rows={3} height={34} />
      </Section>
    ) : null;
  }

  const timed = Boolean(startTime);
  const loadIdx = timed && returnLoadAt != null ? eta.points.findIndex((p) => p.kind === 'returnPickup' || p.alsoReturnPickup) : -1;
  /** The planned arrival at a point, when that point has one. */
  const planFor = (p: RoutePoint): PlannedTime | undefined =>
    !timed ? undefined : p.kind === 'dropoff' ? plannedDropoff : p.kind === 'finalDrop' ? plannedHome : undefined;

  // Minutes after pickup: the drive-only ETA at each point, when the truck is
  // there by the plan (planned time if set, else the ETA), and when it leaves.
  const driveEta: number[] = [0];
  const at: number[] = [];
  const leave: number[] = [];
  for (let i = 0; i < eta.points.length; i++) {
    const plan = planFor(eta.points[i]);
    at.push(i > 0 && plan?.at != null ? plan.at : driveEta[i]);
    leave.push(i === loadIdx ? Math.max(at[i], returnLoadAt!) : at[i] + eta.dwell[i]);
    if (i < eta.legs.length) driveEta.push(leave[i] + eta.legs[i].minutes);
  }
  const last = eta.points.length - 1;
  const lastPlanned = planFor(eta.points[last])?.at != null;
  const tripMinutes = timed ? at[last] : eta.totalMinutes;
  const restMinutes = Math.max(0, tripMinutes - eta.driveMinutes);

  const color = (p: RoutePoint) =>
    p.kind === 'pickup' || p.kind === 'returnPickup' ? Colors.success : p.kind === 'dropoff' || p.kind === 'finalDrop' ? Colors.primary : Colors.gray400;
  const isReturn = (p: RoutePoint) => p.kind === 'returnPickup' || p.kind === 'returnStop' || p.kind === 'finalDrop';
  const unknown = eta.points.filter((p) => !p.coords).map((p) => niceName(p.name));
  const clockText = (mins: number) => {
    const c = clock(startTime!, mins);
    return `${c.time}${c.days > 0 ? ` (+${c.days}d)` : ''}`;
  };

  return (
    <Section icon={Timer} tone="violet" title="Route timing">
      {timed ? (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <Pencil size={11} color={Colors.primary} />
            <Text style={styles.legendText}>Planned — set by you, tap to change</Text>
          </View>
          <View style={styles.legendItem}>
            <Truck size={11} color={Colors.gray500} />
            <Text style={styles.legendText}>Drive-only ETA — no rest</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.list}>
        <View style={styles.rail} />
        {eta.points.map((p, i) => {
          const leg = eta.legs[i];
          const plan = planFor(p);
          const stay = i === loadIdx ? leave[i] - at[i] : eta.dwell[i];
          // Planned vs. what the road alone allows: positive = rest / buffer, negative = too tight.
          const spare = plan?.at != null ? plan.at - driveEta[i] : null;
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
                {!timed ? null : i === 0 ? (
                  <TimeBox mins={0} start={startTime!} caption="leave" planned onPress={onEditPickup} />
                ) : plan ? (
                  plan.at != null ? (
                    <TimeBox mins={plan.at} start={startTime!} caption={plan.auto ? 'planned · auto' : 'planned'} planned onPress={plan.onEdit} />
                  ) : (
                    <TouchableOpacity onPress={plan.onEdit} hitSlop={8} style={styles.setBtn}>
                      <Pencil size={12} color={Colors.primary} />
                      <Text style={styles.setText}>Plan arrival</Text>
                    </TouchableOpacity>
                  )
                ) : (
                  <TimeBox mins={at[i]} start={startTime!} caption="drive-only ETA" />
                )}
              </View>

              {spare != null ? (
                <View style={styles.compare}>
                  <Truck size={12} color={spare < 0 ? Colors.warning : Colors.gray500} />
                  <Text style={[styles.compareText, spare < 0 && { color: Colors.warning }]}>
                    Drive-only ETA {clockText(driveEta[i])}
                    {spare > 0 ? ` · ${dur(spare)} for rest & breaks` : spare < 0 ? ` · planned ${dur(-spare)} earlier than the drive allows` : ' · no time for rest'}
                  </Text>
                </View>
              ) : null}

              {i === loadIdx ? (
                <TouchableOpacity onPress={plannedReturnLoad?.onEdit} disabled={!plannedReturnLoad} activeOpacity={0.6} style={styles.loadRow}>
                  <Text style={styles.stay}>
                    {stay > 0 ? `Waits ${dur(stay)} · ` : ''}loads for return <Text style={styles.loadTime}>{clockText(leave[i])}</Text>
                  </Text>
                  {plannedReturnLoad ? <Pencil size={11} color={Colors.primary} /> : null}
                </TouchableOpacity>
              ) : stay > 0 ? (
                <Text style={styles.stay}>
                  {stay} min at this stop{timed ? ` · leave ${clock(startTime!, leave[i]).time}` : ''}
                </Text>
              ) : null}
              {leg ? (
                <View style={styles.leg}>
                  {leg.source === 'unknown' ? <CircleAlert size={13} color={Colors.warning} /> : <Truck size={13} color={Colors.gray500} />}
                  <Text style={[styles.legText, leg.source === 'unknown' && { color: Colors.warning }]}>
                    {leg.source === 'unknown' ? `${dur(leg.minutes)} drive, assumed` : `${dur(leg.minutes)} drive${leg.km != null ? ` · ${leg.km} km` : ''}`}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.summary}>
        <View style={styles.sumTile}>
          <Text style={styles.sumCap}>Transit (driving)</Text>
          <Text style={styles.sumVal}>{dur(eta.driveMinutes)}</Text>
          {eta.totalKm != null ? <Text style={styles.sumSub}>{eta.totalKm} km</Text> : null}
        </View>
        <View style={styles.sumTile}>
          <Text style={styles.sumCap}>Rest, stops & waits</Text>
          <Text style={styles.sumVal}>{dur(restMinutes)}</Text>
        </View>
        <View style={[styles.sumTile, styles.sumMain]}>
          <Text style={[styles.sumCap, { color: Colors.primaryDark }]}>{timed && lastPlanned ? 'Planned trip' : 'Whole trip'}</Text>
          <Text style={[styles.sumVal, { color: Colors.primaryDark }]}>{dur(tripMinutes)}</Text>
          {timed ? <Text style={styles.sumSub}>arrive {clockText(tripMinutes)}</Text> : null}
        </View>
      </View>
      <Text style={styles.note}>
        {eta.source === 'road' ? 'Drive times are road times from the map service' : eta.source === 'mixed' ? 'Drive times are partly road times, partly approximate' : 'Drive times are approximate, from the distance between places'}
        {eta.dwell.some((d, i) => d > 0 && i !== loadIdx) ? `; ${eta.dwell.find((d) => d > 0)} min is counted at each stop` : ''}.
        {timed ? ' Planned arrivals are yours — leave room for rest and breaks.' : ' Set the pickup to plan arrival times.'}
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

/** A clock time on the right of a stop: bold and tappable when planned, grey when only estimated. */
function TimeBox({ mins, start, caption, planned, onPress }: { mins: number; start: string; caption: string; planned?: boolean; onPress?: () => void }) {
  const c = clock(start, mins);
  const body = (
    <View style={[styles.timeBox, planned && onPress && styles.timeBoxPlanned]}>
      <Text style={[styles.time, !planned && styles.timeEst]}>
        {c.time}
        {c.days > 0 ? <Text style={styles.plusDay}>{`  +${c.days}d`}</Text> : null}
      </Text>
      <View style={styles.capRow}>
        {planned && onPress ? <Pencil size={9} color={Colors.primary} /> : null}
        <Text style={[styles.timeCap, planned && onPress && { color: Colors.primary }]}>{caption}</Text>
      </View>
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} hitSlop={6}>
      {body}
    </TouchableOpacity>
  ) : (
    body
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 11, color: Colors.gray500 },
  list: { position: 'relative', paddingLeft: 20 },
  rail: { position: 'absolute', left: 5, top: 12, bottom: 12, borderLeftWidth: 1.5, borderColor: Colors.gray300, borderStyle: 'dashed' },
  point: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  dot: { position: 'absolute', left: -20, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.white },
  dotSmall: { left: -18, width: 8, height: 8, borderWidth: 0 },
  name: { fontSize: 14, fontWeight: '700', color: Colors.charcoal },
  role: { fontSize: 11, color: Colors.gray500, marginTop: 1 },
  timeBox: { alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  timeBoxPlanned: { backgroundColor: Colors.primaryLight },
  time: { fontSize: 16, fontWeight: '800', color: Colors.charcoal },
  timeEst: { fontSize: 14, fontWeight: '600', color: Colors.gray500 },
  plusDay: { fontSize: 11, fontWeight: '700', color: Colors.warning },
  capRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  timeCap: { fontSize: 10, color: Colors.gray400 },
  setBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.primary },
  setText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  compare: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginBottom: 4 },
  compareText: { fontSize: 11, color: Colors.gray600, flexShrink: 1 },
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginBottom: 2 },
  loadTime: { fontWeight: '700', color: Colors.charcoal },
  stay: { fontSize: 11, color: Colors.gray600, marginBottom: 2 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, marginVertical: 4, alignSelf: 'flex-start', borderRadius: 999, backgroundColor: Colors.gray100 },
  legText: { fontSize: 12, fontWeight: '600', color: Colors.gray600 },
  summary: { flexDirection: 'row', gap: 6, marginTop: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.gray100 },
  sumTile: { flex: 1, padding: 8, borderRadius: 10, backgroundColor: Colors.gray100 },
  sumMain: { backgroundColor: Colors.primaryLight },
  sumCap: { fontSize: 10, fontWeight: '600', color: Colors.gray500 },
  sumVal: { fontSize: 14, fontWeight: '800', color: Colors.charcoal, marginTop: 2 },
  sumSub: { fontSize: 10, color: Colors.gray500, marginTop: 1 },
  note: { fontSize: 11, color: Colors.gray500, marginTop: 8, lineHeight: 16 },
});
