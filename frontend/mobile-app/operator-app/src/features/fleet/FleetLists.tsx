/**
 * The Fleet map's list view beyond trucks (the web live map's ops tabs):
 *
 *   ListTabs        Trucks · Needs attention · Scheduled, with counts.
 *   AttentionList   the trip items of Home's "Needs action" (delayed, late
 *                   start, no driver / truck, GPS quiet or mismatched,
 *                   emergencies, screenshots to check) — same rows, same
 *                   buttons and swipes. Tapping a row shows its truck on the
 *                   map when it has one there, else opens the trip.
 *   ScheduledList   Draft / Scheduled trips by start day: time, how soon (or
 *                   how late), customer, and truck + driver — or a red tag for
 *                   what's missing, and Find truck when it has none. Drafts
 *                   that never got a start date, or
 *                   whose start is over two weeks past, are left out.
 */
import React, { useMemo } from 'react';
import { SectionList, StyleSheet, Text, TouchableOpacity, View, FlatList } from 'react-native';
import { AlertTriangle, CalendarClock, ChevronRight, Truck } from 'lucide-react-native';
import { ActionRow } from '../dashboard/actions/NeedsAction';
import type { ActionIntent, ActionItem, ActionSources } from '../dashboard/actions/actionModel';
import { niceName } from '../trips/create/components/ui';
import type { makeTime } from '../trips/list/tripListModel';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const LINE = '#E9E9EC';
const RED = '#D92D20';

export type ListTab = 'trucks' | 'attention' | 'scheduled';
type Time = ReturnType<typeof makeTime>;
export type ScheduledTrip = ActionSources['unassigned'][number];

/** Drafts whose start is this far past are old plans nobody will run (same as the web). */
const DRAFT_LOOKBACK_DAYS = 14;

/** Trip items only — documents, invoices and photo updates live on Home / Notifications. */
export const attentionItems = (items: ActionItem[]) => items.filter((i) => i.group === 'trips');

export function scheduledTrips(trips: ScheduledTrip[], now: number): ScheduledTrip[] {
  const cutoff = now - DRAFT_LOOKBACK_DAYS * 86_400_000;
  return trips
    .filter((t) => ['Draft', 'Scheduled'].includes(t.status))
    .filter((t) => (t.status === 'Draft' ? !!t.planned_start && new Date(t.planned_start).getTime() >= cutoff : true))
    .sort((a, b) => (a.planned_start ?? '9999').localeCompare(b.planned_start ?? '9999'));
}

export function matchesTripText(t: ScheduledTrip, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const driver = [t.driver?.first_name, t.driver?.last_name].filter(Boolean).join(' ');
  return [t.ref_id, t.customer?.name, t.vehicle?.plate_number, driver, t.carrier_name].some((v) => v?.toLowerCase().includes(s));
}

export function ListTabs({ tab, counts, onChange }: { tab: ListTab; counts: Record<ListTab, number>; onChange: (t: ListTab) => void }) {
  const tabs: { id: ListTab; label: string; icon: typeof Truck }[] = [
    { id: 'trucks', label: 'Trucks', icon: Truck },
    { id: 'attention', label: 'Attention', icon: AlertTriangle },
    { id: 'scheduled', label: 'Scheduled', icon: CalendarClock },
  ];
  return (
    <View style={s.tabs} accessibilityRole="tablist">
      {tabs.map((x) => {
        const on = tab === x.id;
        const hot = x.id === 'attention' && counts.attention > 0;
        const Icon = x.icon;
        return (
          <TouchableOpacity key={x.id} style={[s.tab, on && s.tabOn]} onPress={() => onChange(x.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} activeOpacity={0.8}>
            <Icon size={14} color={hot ? RED : on ? INK : MUTED} strokeWidth={2.3} />
            <Text style={[s.tabText, on && { color: INK }]} numberOfLines={1}>{x.label}</Text>
            <Text style={[s.tabCount, hot && { color: RED }]}>{counts[x.id]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function AttentionList({ items, now, onIntent, onOpenTrip }: {
  items: ActionItem[]; now: number; onIntent: (i: ActionIntent) => void; onOpenTrip: (tripId: string) => void;
}) {
  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.key}
      style={s.box}
      contentContainerStyle={{ paddingBottom: 40 }}
      renderItem={({ item, index }) => <ActionRow item={item} first={index === 0} now={now} onIntent={onIntent} onOpenTrip={onOpenTrip} />}
      ListEmptyComponent={<Text style={s.empty}>Nothing needs attention on the road right now.</Text>}
    />
  );
}

export function ScheduledList({ trips, f, now, onOpenTrip, onFindTruck }: {
  trips: ScheduledTrip[]; f: Time; now: number; onOpenTrip: (tripId: string) => void; onFindTruck: (tripId: string) => void;
}) {
  const sections = useMemo(() => {
    const today = f.dayKey(now);
    const tomorrow = f.dayKey(now + 86_400_000);
    const out: { key: string; title: string; data: ScheduledTrip[] }[] = [];
    for (const t of trips) {
      const key = t.planned_start ? f.dayKey(t.planned_start) : 'none';
      const title = key === 'none' ? 'No start time' : key === today ? 'Today' : key === tomorrow ? 'Tomorrow' : key < today ? 'Should have started' : f.day(t.planned_start);
      const last = out[out.length - 1];
      // Everything before today is one "should have started" group.
      const k = key !== 'none' && key < today ? 'past' : key;
      if (last && last.key === k) last.data.push(t);
      else out.push({ key: k, title, data: [t] });
    }
    return out;
  }, [trips, f, now]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(t) => t.id}
      style={s.box}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      stickySectionHeadersEnabled
      renderSectionHeader={({ section }) => (
        <View style={s.dayHead}>
          <Text style={[s.dayTitle, section.key === 'past' && { color: RED }]}>{section.title}</Text>
          <Text style={s.dayCount}>{section.data.length}</Text>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#F1F1F3' }} />}
      renderItem={({ item }) => <ScheduledRow trip={item} f={f} now={now} onPress={() => onOpenTrip(item.id)} onFindTruck={() => onFindTruck(item.id)} />}
      ListEmptyComponent={<Text style={s.empty}>Nothing scheduled.</Text>}
    />
  );
}

/** "in 2h 10m", "due now", "45m late". */
function startsIn(iso: string | null, now: number): { text: string; hot: boolean } | null {
  if (!iso) return null;
  const min = Math.round((new Date(iso).getTime() - now) / 60000);
  const span = (m: number) => (m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.floor(m / 60)}h${m % 60 && m < 600 ? ` ${m % 60}m` : ''}` : `${Math.floor(m / 1440)}d`);
  if (min < -1) return { text: `${span(-min)} late`, hot: true };
  if (min <= 1) return { text: 'due now', hot: true };
  return { text: `in ${span(min)}`, hot: false };
}

export function ScheduledRow({ trip: t, f, now, onPress, onFindTruck }: { trip: ScheduledTrip; f: Time; now: number; onPress: () => void; onFindTruck: () => void }) {
  const when = startsIn(t.planned_start, now);
  const driver = [t.driver?.first_name, t.driver?.last_name].filter(Boolean).join(' ');
  const plate = t.vehicle?.plate_number ?? null;
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.6}>
      <View style={s.time}>
        <Text style={s.timeText}>{t.planned_start ? f.time(t.planned_start) : '—'}</Text>
        {when ? <Text style={[s.when, when.hot && { color: RED, fontWeight: '600' }]}>{when.text}</Text> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.ref} numberOfLines={1}>
          {t.ref_id ?? 'Trip'}
          {t.status === 'Draft' ? <Text style={s.draft}>  Draft</Text> : null}
        </Text>
        <Text style={s.sub} numberOfLines={1}>{niceName(t.customer?.name) || 'No customer'}</Text>
        {t.is_third_party ? (
          <Text style={s.sub} numberOfLines={1}>3PL · {t.carrier_name ?? 'partner'}</Text>
        ) : (
          <View style={s.assign}>
            {plate ? <Text style={s.sub}>{plate}</Text> : <Text style={s.missing}>No truck</Text>}
            <Text style={s.sub}>·</Text>
            {driver ? <Text style={s.sub} numberOfLines={1}>{niceName(driver)}</Text> : <Text style={s.missing}>No driver</Text>}
          </View>
        )}
      </View>
      {!plate && !t.is_third_party ? (
        <TouchableOpacity style={s.find} onPress={onFindTruck} hitSlop={6} accessibilityLabel={`Find a truck for ${t.ref_id ?? 'this trip'}`}>
          <Text style={s.findText}>Find truck</Text>
        </TouchableOpacity>
      ) : <ChevronRight size={16} color="#A1A1AA" />}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, backgroundColor: '#EFEFF1', borderRadius: 12, padding: 3 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 34, borderRadius: 10 },
  tabOn: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  tabCount: { fontSize: 12, color: MUTED, fontVariant: ['tabular-nums'] },

  box: { flex: 1, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: LINE },
  empty: { textAlign: 'center', color: MUTED, paddingTop: 40, fontSize: 14, paddingHorizontal: 24 },

  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.97)', paddingTop: 12, paddingBottom: 6 },
  dayTitle: { fontSize: 12, fontWeight: '700', color: INK, textTransform: 'uppercase', letterSpacing: 0.5 },
  dayCount: { fontSize: 12, color: MUTED, fontVariant: ['tabular-nums'] },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  time: { width: 62 },
  timeText: { fontSize: 16, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  when: { fontSize: 11, color: MUTED, marginTop: 1 },
  ref: { fontSize: 14, fontWeight: '700', color: INK },
  draft: { fontSize: 11, fontWeight: '600', color: MUTED },
  sub: { fontSize: 13, color: MUTED },
  assign: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  missing: { fontSize: 12, fontWeight: '700', color: RED },
  find: { height: 32, borderRadius: 9, backgroundColor: INK, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  findText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
