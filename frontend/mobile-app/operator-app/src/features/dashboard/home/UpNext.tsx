/**
 * Trips still to start today (Draft / Scheduled), soonest first: start time
 * and countdown, customer, and the truck and driver — or a red tag when one is
 * missing, so a gap shows before the trip is due. A start that has passed
 * reads "15 min late". 3PL trips show the partner. The full list is on Trips.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CalendarCheck, ChevronRight } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { ActionSources } from '../actions/actionModel';
import { toStartToday } from './today';
import { niceName } from '../../trips/create/components/ui';
import { INK, LINE, MUTED, tap } from '../../notifications/components/parts';

const RED = '#D92D20';
const SHOWN = 3;

export function UpNext({ trips, tz, now, onOpenTrip, onAssign, onAll }: {
  trips: ActionSources['unassigned'];
  tz: string;
  now: number;
  onOpenTrip: (id: string) => void;
  /** Opens the trip on its assign sheet for what's missing first. */
  onAssign: (id: string, what: 'driver' | 'truck') => void;
  onAll: () => void;
}) {
  const time = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
    } catch {
      return '—';
    }
  };
  const startsIn = (iso: string | null) => {
    if (!iso) return null;
    const min = Math.round((new Date(iso).getTime() - now) / 60000);
    const span = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 && m < 600 ? ` ${m % 60}m` : ''}`);
    if (min < -1) return { text: `${span(-min)} late`, hot: true };
    if (min <= 1) return { text: 'due now', hot: true };
    return { text: `in ${span(min)}`, hot: false };
  };
  const upcoming = toStartToday(trips, tz, now);
  const next = upcoming.slice(0, SHOWN);

  return (
    <View style={{ gap: 10 }}>
      <View style={s.head}>
        <Text style={s.h2}>Up next today</Text>
        <TouchableOpacity onPress={() => { tap(); onAll(); }} hitSlop={8} style={s.link}>
          <Text style={s.linkText}>{upcoming.length > SHOWN ? `All ${upcoming.length}` : 'All trips'}</Text>
          <ChevronRight size={15} color={MUTED} />
        </TouchableOpacity>
      </View>

      {next.length === 0 ? (
        <View style={[s.card, s.empty]}>
          <CalendarCheck size={20} color="#A1A1AA" strokeWidth={2} />
          <Text style={s.emptyText}>No more trips starting today</Text>
        </View>
      ) : (
        <View style={s.card}>
          {next.map((t, i) => {
            const due = startsIn(t.planned_start);
            const driver = t.driver ? niceName(`${t.driver.first_name ?? ''} ${t.driver.last_name ?? ''}`.trim()) : null;
            const missing = t.is_third_party ? [] : ([!t.driver ? 'No driver' : null, !t.vehicle ? 'No truck' : null].filter(Boolean) as string[]);
            const crew = t.is_third_party
              ? niceName(t.carrier_name) || '3PL partner'
              : [t.vehicle?.plate_number, driver].filter(Boolean).join(' · ');
            return (
              <TouchableOpacity key={t.id} style={[s.row, i > 0 && s.border]} onPress={() => { tap(); onOpenTrip(t.id); }} activeOpacity={0.7}>
                <View style={s.when}>
                  <Text style={s.time}>{time(t.planned_start)}</Text>
                  {due ? <Text style={[s.in, due.hot && { color: RED }]}>{due.text}</Text> : null}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.name} numberOfLines={1}>{niceName(t.customer?.name) || '—'}</Text>
                  <Text style={s.meta} numberOfLines={1}>{[t.ref_id, crew].filter(Boolean).join(' · ')}</Text>
                  {missing.length ? (
                    <View style={s.tags}>
                      {missing.map((m) => <View key={m} style={s.tag}><Text style={s.tagText}>{m}</Text></View>)}
                    </View>
                  ) : null}
                </View>
                {missing.length ? (
                  <TouchableOpacity style={s.assign} onPress={() => { tap(); onAssign(t.id, t.driver ? 'truck' : 'driver'); }} hitSlop={6}>
                    <Text style={s.assignText}>Assign</Text>
                  </TouchableOpacity>
                ) : <ChevronRight size={18} color="#C4C4CC" />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  h2: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 14, fontWeight: '500', color: MUTED },

  card: { backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  emptyText: { fontSize: 14, color: MUTED },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  border: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  when: { width: 66 },
  time: { fontSize: 17, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  in: { fontSize: 12, fontWeight: '600', color: MUTED, marginTop: 1 },
  name: { fontSize: 15, fontWeight: '600', color: INK },
  meta: { fontSize: 13, color: MUTED },
  tags: { flexDirection: 'row', gap: 6, marginTop: 2 },
  tag: { paddingHorizontal: 8, height: 22, borderRadius: 6, backgroundColor: '#FEF3F2', justifyContent: 'center' },
  tagText: { fontSize: 12, fontWeight: '700', color: RED },
  assign: { height: 34, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: INK },
  assignText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
