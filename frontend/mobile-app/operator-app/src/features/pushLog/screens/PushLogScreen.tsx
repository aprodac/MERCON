/**
 * Push log (Admins) — did staff pushes reach the operator app, and how fast.
 *
 * Top: the last 24 hours in numbers. Then each staff member's phones (or
 * "no phone signed in"), and every push of the last 7 days with what happened
 * to it: arrived (the phone said so — iPhones; with the delay), delivered to
 * Apple/Google (Android can't say more), waiting, retrying, or failed and why.
 * Tapping a person shows only their pushes; tapping a push opens its trip.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BellOff, ShieldAlert, Smartphone, X } from 'lucide-react-native';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppTopBar } from '@/components/AppTopBar';
import { BG, Chips, EmptyState, INK, MUTED, SectionLabel, SkeletonCard, p, tap } from '@/features/notifications/components/parts';
import { cleanTitle, shortTime, targetFor } from '@/features/notifications/notificationModel';
import { pushLogApi, type PushLogFilter, type PushLogItem, type PushLogPerson } from '../pushLogApi';
import { LOG_TONE, formatDelay, outcomeLabel, phoneName, type LogTone } from '../pushLogModel';

const FILTERS: { value: PushLogFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'slow', label: 'Slow (over 1 min)' },
];

export default function PushLogScreen() {
  const router = useRouter();
  const { role } = useAuth();
  const isAdmin = role === 'Admin';
  const [filter, setFilter] = useState<PushLogFilter>('all');
  const [person, setPerson] = useState<PushLogPerson | null>(null);

  const log = useQuery({
    queryKey: ['push-log', filter, person?.id ?? null],
    queryFn: () => pushLogApi.get(filter, person?.id),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });
  // "3 min ago" is measured from the last load (it refreshes every 30 s).
  const now = log.dataUpdatedAt;

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <AppTopBar title="Push log" />
        <EmptyState icon={ShieldAlert} title="Admins only" text="Ask an admin if you need to check whether alerts reach the phones." />
      </SafeAreaView>
    );
  }

  const data = log.data;
  const sum = data?.summary;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <AppTopBar title="Push log" />
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 120, gap: 20 }}
        refreshControl={<RefreshControl refreshing={log.isRefetching} onRefresh={() => log.refetch()} tintColor="#FA634E" />}
      >
        <View style={s.pad}>
          <SectionLabel title="Last 24 hours" />
          {sum ? (
            <View style={[p.card, s.summary]}>
              <Stat label="Sent" value={String(sum.total)} />
              <Stat label="Arrived" value={String(sum.arrived)} tone="green" />
              <Stat label="Failed" value={String(sum.failed)} tone={sum.failed ? 'red' : undefined} />
              <Stat label="Typical delay" value={sum.typicalDelayMs != null ? formatDelay(sum.typicalDelayMs) : '—'} />
              <Stat label="Slow" value={String(sum.slow)} tone={sum.slow ? 'amber' : undefined} />
            </View>
          ) : log.isLoading ? <SkeletonCard rows={1} /> : null}
          <Text style={s.note}>
            {'"Arrived" means the phone itself said it got the alert — iPhones on the newest app. Android phones only show "Delivered to Google".'}
          </Text>
        </View>

        {log.isError ? (
          <View style={s.pad}>
            <View style={[p.card, { padding: 14 }]}>
              <Text style={s.errorText}>{`Couldn't load the push log: ${getApiErrorMessage(log.error)}`}</Text>
            </View>
          </View>
        ) : null}

        {data ? (
          <View style={s.pad}>
            <SectionLabel title="Phones" count={data.people.length} />
            <View style={p.card}>
              {data.people.map((u, i) => (
                <PersonRow
                  key={u.id}
                  person={u}
                  first={i === 0}
                  now={now}
                  selected={person?.id === u.id}
                  onPress={() => { tap(); setPerson(person?.id === u.id ? null : u); }}
                />
              ))}
            </View>
          </View>
        ) : null}

        <Chips options={FILTERS} value={filter} onChange={setFilter} />
        {person ? (
          <View style={s.pad}>
            <TouchableOpacity style={s.personChip} onPress={() => { tap(); setPerson(null); }} accessibilityRole="button" accessibilityLabel="Show everyone">
              <Text style={s.personChipText}>Only {person.name ?? person.username}</Text>
              <X size={14} color={Colors.white} />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={s.pad}>
          <SectionLabel title="Pushes · last 7 days" count={data?.items.length} />
          {log.isLoading ? (
            <SkeletonCard rows={4} />
          ) : data && data.items.length > 0 ? (
            <View style={p.card}>
              {data.items.map((item, i) => (
                <PushRow
                  key={item.id}
                  item={item}
                  first={i === 0}
                  now={now}
                  onPress={() => {
                    const target = targetFor({
                      id: item.id, title: item.title, message: item.message, type: item.type, is_read: true,
                      entity_type: item.entity_type, entity_id: item.entity_id, createdAt: item.createdAt,
                    });
                    if (target) { tap(); router.push(target); }
                  }}
                />
              ))}
            </View>
          ) : data ? (
            <EmptyState
              icon={BellOff}
              title={filter === 'failed' ? 'No failed pushes' : filter === 'slow' ? 'No slow pushes' : 'No pushes yet'}
              text="Pushes appear here once staff are signed in on the operator app and something happens."
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: LogTone }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, tone && { color: LOG_TONE[tone].fg }]} numberOfLines={1}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Pill({ text, tone }: { text: string; tone: LogTone }) {
  return (
    <View style={[s.pill, { backgroundColor: LOG_TONE[tone].bg }]}>
      <Text style={[s.pillText, { color: LOG_TONE[tone].fg }]}>{text}</Text>
    </View>
  );
}

function PersonRow({ person, first, now, selected, onPress }: {
  person: PushLogPerson; first: boolean; now: number; selected: boolean; onPress: () => void;
}) {
  const phones = person.phones.filter((ph) => ph.pushOn);
  return (
    <TouchableOpacity style={[s.row, !first && p.rowBorder, selected && s.rowSelected]} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <View style={s.rowIcon}><Smartphone size={18} color={phones.length ? INK : '#B54708'} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{person.name ?? person.username} <Text style={s.muted}>· {person.role}</Text></Text>
        <Text style={s.rowSub} numberOfLines={2}>
          {phones.length
            ? phones.map((ph) => `${phoneName(ph.platform)} · seen ${shortTime(ph.lastSeenAt, now)}`).join('  ·  ')
            : person.phones.length
            ? 'Signed out or notifications off — gets no pushes'
            : 'No phone signed in — gets no pushes'}
        </Text>
      </View>
      {phones.length ? <Pill text="Push on" tone="green" /> : <Pill text="No push" tone="amber" />}
    </TouchableOpacity>
  );
}

function PushRow({ item, first, now, onPress }: { item: PushLogItem; first: boolean; now: number; onPress: () => void }) {
  const status = outcomeLabel(item);
  const to = item.recipient?.name ?? item.recipient?.username ?? 'Someone';
  return (
    <TouchableOpacity style={[s.push, !first && p.rowBorder]} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <View style={s.pushTop}>
        <Text style={s.rowTitle} numberOfLines={1}>{cleanTitle(item.title)}</Text>
        <Text style={s.time}>{shortTime(item.createdAt, now)}</Text>
      </View>
      <Text style={s.rowSub} numberOfLines={2}>{item.message}</Text>
      <View style={s.pushBottom}>
        <Text style={[s.muted, { flex: 1 }]} numberOfLines={1}>
          To {to} · {phoneName(item.phone?.platform)}{item.attempts > 1 ? ` · ${item.attempts} tries` : ''}
        </Text>
        <Pill text={status.text} tone={status.tone} />
      </View>
      {item.reason ? <Text style={s.reason}>{item.reason}</Text> : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  pad: { paddingHorizontal: 16 },
  summary: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 6 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, fontWeight: '600', color: MUTED },
  note: { fontSize: 12, color: MUTED, lineHeight: 17, marginTop: 8, paddingHorizontal: 4 },
  errorText: { fontSize: 14, color: '#D92D20' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowSelected: { backgroundColor: '#F6F6F7' },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: INK, flexShrink: 1 },
  rowSub: { fontSize: 13, color: MUTED, lineHeight: 18 },
  muted: { fontSize: 13, color: MUTED, fontWeight: '400' },
  personChip: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, backgroundColor: INK, borderRadius: 16, paddingHorizontal: 12, height: 32 },
  personChipText: { color: Colors.white, fontSize: 13, fontWeight: '600' },
  push: { padding: 14, gap: 4 },
  pushTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pushBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  time: { marginLeft: 'auto', fontSize: 12, color: MUTED, fontVariant: ['tabular-nums'] },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '600' },
  reason: { fontSize: 13, color: '#D92D20', lineHeight: 18, marginTop: 2 },
});
