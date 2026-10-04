/**
 * "Activity": the operator's notification feed (GET /notifications, newest
 * 50), by day. Unread rows are bold with a dot; tapping one marks it read and
 * opens the trip / driver / truck it's about. Swipe left to mark read without
 * opening. Chips narrow it to unread, trips, drivers or account notices.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, SectionList, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import * as Haptics from 'expo-haptics';
import { BellOff, Check, ChevronRight, TriangleAlert } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { AppNotification } from '@mercon/mobile-shared/lib/notifications';
import {
  ACTIVITY_FILTERS, TONE, cleanTitle, matchesFilter, notificationStyle, sectionsByDay, shortTime, targetFor, type ActivityFilter,
} from '../notificationModel';
import { Chips, EmptyState, SectionLabel, SkeletonCard, INK, LINE, MUTED, tap } from './parts';

export function ActivityTab({ items, loading, error, now, refreshing, onRefresh, onOpen, onMarkRead, canMarkAll, onMarkAllRead }: {
  items: AppNotification[];
  loading: boolean;
  error: string | null;
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (n: AppNotification) => void;
  onMarkRead: (id: string) => void;
  /** False when only emergencies are unread — those are cleared with Handled on To do. */
  canMarkAll: boolean;
  onMarkAllRead: () => void;
}) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const unread = items.filter((n) => !n.is_read).length;

  const chips = useMemo(
    () => ACTIVITY_FILTERS.map((f) => ({ ...f, count: f.value === 'unread' ? unread : undefined }))
      // Category chips only when there's something in them.
      .filter((f) => f.value === 'all' || f.value === 'unread' || items.some((n) => matchesFilter(n, f.value))),
    [items, unread],
  );
  const sections = useMemo(() => sectionsByDay(items.filter((n) => matchesFilter(n, filter)), now), [items, filter, now]);

  const empty = loading ? (
    <View style={{ paddingHorizontal: 16 }}><SkeletonCard rows={5} /></View>
  ) : error ? (
    <EmptyState icon={TriangleAlert} title="Couldn't load notifications" text={error} />
  ) : filter === 'unread' ? (
    <EmptyState icon={Check} color="#16A34A" title="No unread notifications" text="You've read everything." />
  ) : (
    <EmptyState icon={BellOff} title="No notifications yet" text="Delays, driver alerts and emergencies will appear here." />
  );

  return (
    <SectionList
      sections={sections}
      keyExtractor={(n) => n.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FA634E" />}
      ListHeaderComponent={
        items.length > 0 ? (
          <View style={{ gap: 12, marginBottom: 8 }}>
            <Chips options={chips} value={filter} onChange={setFilter} />
          </View>
        ) : null
      }
      ListEmptyComponent={empty}
      renderSectionHeader={({ section }) => (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <SectionLabel
            title={section.title}
            right={
              section === sections[0] && canMarkAll ? (
                <TouchableOpacity onPress={() => { tap(); onMarkAllRead(); }} hitSlop={8}>
                  <Text style={s.markAll}>Mark all read</Text>
                </TouchableOpacity>
              ) : null
            }
          />
        </View>
      )}
      renderItem={({ item, index, section }) => (
        <View style={[s.cardSlice, index === 0 && s.cardTop, index === section.data.length - 1 && s.cardBottom]}>
          <NotificationRow n={item} first={index === 0} now={now} onOpen={onOpen} onMarkRead={onMarkRead} />
        </View>
      )}
    />
  );
}

function NotificationRow({ n, first, now, onOpen, onMarkRead }: {
  n: AppNotification; first: boolean; now: number; onOpen: (n: AppNotification) => void; onMarkRead: (id: string) => void;
}) {
  const st = notificationStyle(n);
  const tone = TONE[st.tone];
  const Icon = st.icon;
  const unread = !n.is_read;
  const opens = targetFor(n) != null;

  const body = (
    <TouchableOpacity style={[s.row, !first && s.rowBorder]} onPress={() => { tap(); onOpen(n); }} activeOpacity={0.6}
      accessibilityRole="button" accessibilityLabel={`${unread ? 'Unread. ' : ''}${cleanTitle(n.title)}. ${n.message}`}>
      <View style={[s.icon, { backgroundColor: tone.bg }]}><Icon size={18} color={tone.fg} strokeWidth={2.2} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={s.titleRow}>
          <Text style={[s.title, unread && s.titleUnread]} numberOfLines={1}>{cleanTitle(n.title)}</Text>
          <Text style={[s.time, unread && { color: INK, fontWeight: '600' }]}>{shortTime(n.createdAt, now)}</Text>
        </View>
        <Text style={[s.message, unread && { color: '#52525B' }]} numberOfLines={3}>{n.message}</Text>
      </View>
      <View style={s.trail}>
        {unread ? <View style={s.dot} /> : opens ? <ChevronRight size={16} color="#C4C4CC" /> : null}
      </View>
    </TouchableOpacity>
  );

  // Emergencies are cleared with Handled on To do, not swiped away here.
  if (!unread || n.type.toLowerCase() === 'emergency') return <View style={{ backgroundColor: Colors.white }}>{body}</View>;

  const markRead = (m: SwipeableMethods) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    m.close();
    onMarkRead(n.id);
  };
  return (
    <ReanimatedSwipeable
      friction={1.6}
      overshootRight={false}
      rightThreshold={60}
      renderRightActions={(_p, _t, m) => (
        <TouchableOpacity style={s.swipe} onPress={() => markRead(m)} accessibilityLabel="Mark as read">
          <Check size={18} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={s.swipeText}>Read</Text>
        </TouchableOpacity>
      )}
    >
      <View style={{ backgroundColor: Colors.white }}>{body}</View>
    </ReanimatedSwipeable>
  );
}

const s = StyleSheet.create({
  // One card per day section, built from slices so SectionList can virtualise rows.
  cardSlice: { marginHorizontal: 16, backgroundColor: Colors.white, borderLeftWidth: 1, borderRightWidth: 1, borderColor: LINE, overflow: 'hidden' },
  cardTop: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  cardBottom: { borderBottomWidth: 1, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '500', color: INK, lineHeight: 20 },
  titleUnread: { fontWeight: '700' },
  time: { fontSize: 12, color: MUTED, fontVariant: ['tabular-nums'] },
  message: { fontSize: 13, color: MUTED, lineHeight: 18 },
  trail: { width: 16, alignItems: 'center', alignSelf: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FA634E' },
  markAll: { fontSize: 13, fontWeight: '600', color: INK },

  swipe: { width: 88, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center', gap: 4 },
  swipeText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
