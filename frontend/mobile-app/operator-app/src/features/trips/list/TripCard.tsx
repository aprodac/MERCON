/**
 * One trip as a compact card (owner, 23 Oct: about 40% shorter), top to bottom:
 *   customer (logo, name, trip no. · time — finished: started → delivered)   status
 *   route on one line   Riyadh → Jeddah   [↺ Round trip] [Leg 1 going] [+N stops]
 *   how late, and the driver's delay reason (delayed trips only)
 *   driver (first and last name) · plate · call
 * Long-press for quick actions.
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Phone, Truck, AlertCircle, Clock3, RotateCcw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const AMBER = '#B54708';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { OperatorTrip } from '../../../lib/operator';
import { CompanyAvatar, initialsOf, niceName, shortName } from '../create/components/ui';
import { DriverAvatar } from '../../drivers/components/DriverAvatar';
import { legLabel } from '../tripLegs';
import {
  PHASE_STYLE, delayReasonOf, driverNameOf, driverPhoneOf, lateLineOf, phaseOf, plateOf, routeOf, statusText,
  type TimeFmt,
} from './tripListModel';

const INK = '#3E3C3D';
const MUTED = '#71717A';
const RED = '#B42318';

interface Props {
  trip: OperatorTrip;
  f: TimeFmt;
  now: number;
  /** Show the day as well as the time (search results, the Now list). */
  showDay?: boolean;
  /** This trip double-books its driver or truck ("Overlaps TRP-0026 · same driver"). */
  clash?: string | null;
  onPress: (t: OperatorTrip) => void;
  onLongPress: (t: OperatorTrip) => void;
}

function TripCardBase({ trip: t, f, now, showDay, clash, onPress, onLongPress }: Props) {
  const phase = phaseOf(t.status);
  const ps = PHASE_STYLE[phase];
  const route = routeOf(t);
  const driver = driverNameOf(t);
  const phone = driverPhoneOf(t);
  const plate = plateOf(t);
  const done = phase === 'done';
  const muted = phase === 'cancelled';
  const open = phase === 'draft' || phase === 'planned' || phase === 'running' || phase === 'delayed';
  const reason = phase === 'delayed' ? delayReasonOf(t) : null;
  const late = lateLineOf(t, now, f.time);

  const when = done && t.actual_end ? t.actual_end : t.planned_start ?? t.createdAt ?? null;
  // With the day shown, today and tomorrow say so ("Today · 20:00") instead of dropping the date.
  const dayWord = (iso: string) => {
    const k = f.dayKey(iso);
    if (k === f.dayKey(now)) return 'Today';
    if (k === f.dayKey(now + 86_400_000)) return 'Tomorrow';
    if (k === f.dayKey(now - 86_400_000)) return 'Yesterday';
    return f.day(iso);
  };
  // Non-breaking spaces keep "Thu 15 Oct · 20:00" on one line when the row wraps.
  const nb = (x: string) => x.replace(/ /g, '\u00A0');
  const at = (iso: string) => nb(showDay ? `${dayWord(iso)} · ${f.time(iso)}` : f.time(iso));
  // Finished trips: started → delivered. The start gets its day when the trip ran overnight.
  const start = done && t.actual_end ? t.actual_start : null;
  const startLabel = start ? (f.dayKey(start) !== f.dayKey(t.actual_end!) ? `${f.day(start)} · ${f.time(start)}` : f.time(start)) : '';
  const timeLabel = start ? `${startLabel} → ${at(t.actual_end!)}` : when ? at(when) : '';
  const sub = [t.ref_id ?? t.id.slice(0, 8), timeLabel].filter(Boolean).join('  ·  ');

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(t)}
      onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onLongPress(t); }}
      delayLongPress={300}
      style={[s.card, (phase === 'delayed' || !!clash) && s.cardUrgent, muted && { opacity: 0.65 }]}
    >
      {/* Customer · status */}
      <View style={s.top}>
        <CompanyAvatar name={t.customer?.name} url={t.customer?.logo_url} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={s.customer} numberOfLines={1}>{niceName(t.customer?.name) || 'No customer'}</Text>
          {/* Two lines: next to the status badge one line cut off the time ("Thu 10 Sep..."). */}
          <Text style={s.sub} numberOfLines={2}>{sub}</Text>
        </View>
        <View style={[s.status, { backgroundColor: ps.bg }]}>
          <View style={[s.dot, { backgroundColor: ps.dot }]} />
          <Text style={[s.statusText, { color: ps.fg }]}>{statusText(t)}</Text>
        </View>
      </View>

      {/* Route on one line; round trip, leg and extra stops as small tags after it. */}
      <View style={s.routeRow}>
        <Text style={s.routeText} numberOfLines={2}>
          {niceName(route.from)}<Text style={s.arrow}>{'  →  '}</Text>{niceName(route.to)}
        </Text>
        {route.back ? (
          <View style={s.tag}>
            <RotateCcw size={11} color={MUTED} strokeWidth={2.4} />
            <Text style={s.tagText}>{niceName(route.back) === niceName(route.from) ? 'Round trip' : `Back to ${niceName(route.back)}`}</Text>
          </View>
        ) : null}
        {route.leg ? <View style={[s.tag, s.legTag]}><Text style={[s.tagText, s.legText]}>{legLabel(route.leg)}</Text></View> : null}
        {route.via > 0 ? <View style={s.tag}><Text style={s.tagText}>{`+${route.via} ${route.via === 1 ? 'stop' : 'stops'}`}</Text></View> : null}
      </View>

      {late || reason ? (
        <View style={s.reason}>
          {late ? <Clock3 size={14} color={RED} strokeWidth={2.4} /> : <AlertCircle size={14} color={RED} strokeWidth={2.4} />}
          <Text style={s.reasonText} numberOfLines={2}>{[late, reason].filter(Boolean).join(' · ')}</Text>
        </View>
      ) : null}

      {/* On the road well before its time (TestFlight 30 Oct, TRP-0095 "on the road" with "due 14:00"):
          say so, so it doesn't read as a mistake. */}
      {(() => {
        const startedEarly = t.actual_start && t.planned_start ? Date.parse(t.planned_start) - Date.parse(t.actual_start) : 0;
        if ((phase !== 'running' && phase !== 'delayed') || startedEarly < 60 * 60_000) return null;
        const h = Math.round(startedEarly / 3_600_000);
        const early = h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h`;
        return (
          <View style={[s.reason, s.earlyBox]}>
            <Clock3 size={14} color={AMBER} strokeWidth={2.4} />
            <Text style={[s.reasonText, { color: AMBER }]} numberOfLines={2}>{`Started ${early} early · driver started at ${f.time(t.actual_start)}`}</Text>
          </View>
        );
      })()}

      {clash ? (
        <View style={s.reason}>
          <AlertCircle size={14} color={RED} strokeWidth={2.4} />
          <Text style={s.reasonText} numberOfLines={2}>{clash}</Text>
        </View>
      ) : null}

      {/* Driver · plate · call */}
      <View style={s.foot}>
        {driver ? (
          <DriverAvatar initials={initialsOf(driver)} avatarUrl={t.is_third_party ? null : t.driver?.avatar_url} size={28} />
        ) : <View style={s.noDriver} />}
        <Text style={[s.driver, !driver && open && { color: RED }]} numberOfLines={1}>
          {driver ? shortName(driver) : open ? 'No driver yet' : '—'}
        </Text>
        {plate ? (
          <View style={s.plate}>
            <Truck size={12} color={MUTED} strokeWidth={2.2} />
            <Text style={s.plateText} numberOfLines={1}>{plate}</Text>
          </View>
        ) : open && !t.is_third_party ? (
          <Text style={s.noTruck}>No truck</Text>
        ) : null}
        {phone && open ? (
          <TouchableOpacity
            style={s.call}
            hitSlop={8}
            accessibilityLabel={`Call ${driver ?? 'driver'}`}
            onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})}
          >
            <Phone size={16} color="#15803D" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export const TripCard = memo(TripCardBase);

const s = StyleSheet.create({
  earlyBox: { backgroundColor: '#FEF6E7' },
  card: {
    backgroundColor: Colors.white, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, gap: 10,
    borderWidth: 1, borderColor: '#ECECEF',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  cardUrgent: { borderColor: '#FDD5D1' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customer: { fontSize: 15, fontWeight: '700', color: INK, lineHeight: 20 },
  sub: { fontSize: 12, fontWeight: '500', color: MUTED, marginTop: 1, fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },

  routeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  routeText: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: INK, lineHeight: 20, marginRight: 2 },
  arrow: { color: '#A1A1AA', fontWeight: '600' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#F4F4F5' },
  tagText: { fontSize: 11, fontWeight: '700', color: MUTED },
  legTag: { backgroundColor: '#E7EEFC' },
  legText: { color: '#1D4ED8' },

  reason: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3F2', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  reasonText: { flex: 1, fontSize: 12, fontWeight: '600', color: RED },

  foot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noDriver: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#FDA29B' },
  driver: { flex: 1, fontSize: 13, fontWeight: '600', color: '#3F3F46', lineHeight: 17 },
  plate: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, backgroundColor: '#F4F4F5', paddingHorizontal: 8, paddingVertical: 5 },
  plateText: { fontSize: 12, fontWeight: '700', color: '#3F3F46', fontFamily: 'monospace' },
  noTruck: { fontSize: 12, fontWeight: '700', color: RED },
  call: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#ECFDF3', alignItems: 'center', justifyContent: 'center' },
});
