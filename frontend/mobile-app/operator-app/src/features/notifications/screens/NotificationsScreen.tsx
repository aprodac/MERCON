/**
 * Operator Notifications, in three tabs:
 *   From drivers — photo / video sets drivers sent, the ones still to pass on
 *              to the customer's WhatsApp first (the default tab).
 *   To do    — what needs someone to act (delays, trips without a driver,
 *              GPS silence, photos to send, expiring documents, overdue
 *              invoices), the same live items as Home's Needs action list.
 *   Activity — the notification feed from the API, by day.
 * Opens on From drivers; `?tab=todo` / `?tab=activity` open the others, and
 * `?filter=trips|whatsapp|documents|money` opens To do on that chip.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { AppNotification } from '@mercon/mobile-shared/lib/notifications';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { AppTopBar } from '@/components/AppTopBar';
import { useActionInbox } from '../../dashboard/actions/useActionInbox';
import { useActionIntent } from '../../dashboard/actions/useActionIntent';
import { useDashboardRefresh } from '../../dashboard/hooks';
import { useMarkNotificationsRead, useNotifications } from '../hooks/useNotifications';
import { targetFor } from '../notificationModel';
import { TodoTab, type GroupFilter } from '../components/TodoTab';
import { ActivityTab } from '../components/ActivityTab';
import { DriversTab } from '../components/DriversTab';
import { BG, INK, LINE, MUTED, tap } from '../components/parts';

type Tab = 'drivers' | 'todo' | 'activity';

export default function NotificationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; filter?: string }>();
  const initialFilter: GroupFilter = (['trips', 'whatsapp', 'documents', 'money'] as const).find((g) => g === params.filter) ?? 'all';
  const [tab, setTab] = useState<Tab>(
    params.tab === 'activity' ? 'activity' : params.tab === 'todo' || params.filter ? 'todo' : 'drivers',
  );

  // Ticks each minute so "12m late" / "5 min" stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const inbox = useActionInbox();
  const { onIntent, openTrip, toast, setToast } = useActionIntent();
  const { refreshing, refresh } = useDashboardRefresh();

  const feed = useNotifications();
  const { markRead, markIds } = useMarkNotificationsRead();
  const items = feed.data ?? [];
  const unread = items.filter((n) => !n.is_read).length;

  // Emergencies stay unread until someone presses Handled on To do — reading
  // one is what clears it there, so a bulk "Mark all read" mustn't dismiss it.
  const isEmergency = (n: AppNotification) => n.type.toLowerCase() === 'emergency';
  const markable = items.filter((n) => !n.is_read && !isEmergency(n));
  const markAllRead = () => markIds(markable.map((n) => n.id));

  const openNotification = (n: AppNotification) => {
    if (!n.is_read && !isEmergency(n)) markRead(n.id);
    const target = targetFor(n);
    if (target) router.push(target);
  };

  const urgent = inbox.counts.now;
  const toSend = inbox.updates.filter((u) => u.unsent_count > 0).length;
  const tabs: { value: Tab; label: string; count: number; hot: boolean }[] = [
    { value: 'drivers', label: 'From drivers', count: toSend, hot: false },
    { value: 'todo', label: 'To do', count: inbox.items.length, hot: urgent > 0 },
    { value: 'activity', label: 'Activity', count: unread, hot: false },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <AppTopBar title="Notifications" hideBell />

      <View style={s.tabs} accessibilityRole="tablist">
        {tabs.map((t) => {
          const on = tab === t.value;
          return (
            <TouchableOpacity
              key={t.value}
              style={[s.tab, on && s.tabOn]}
              onPress={() => { tap(); setTab(t.value); }}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t.label}${t.count ? `, ${t.count}` : ''}`}
            >
              <Text style={[s.tabText, on && s.tabTextOn]}>{t.label}</Text>
              {t.count > 0 ? (
                <View style={[s.badge, t.hot ? s.badgeHot : on ? s.badgeOn : null]}>
                  <Text style={[s.badgeText, (t.hot || on) && { color: Colors.white }]}>{t.count > 99 ? '99+' : t.count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'drivers' ? (
          <DriversTab
            updates={inbox.updates}
            loading={inbox.loading}
            now={now}
            refreshing={refreshing}
            onRefresh={refresh}
            onSend={(u) => openTrip(u.trip.id, { share: 'update', update: u.key })}
            onOpenTrip={(id) => openTrip(id)}
          />
        ) : tab === 'todo' ? (
          <TodoTab
            items={inbox.items}
            initialFilter={initialFilter}
            loading={inbox.loading}
            liveError={inbox.liveError}
            onRetry={inbox.retry}
            now={now}
            refreshing={refreshing}
            onRefresh={refresh}
            onIntent={onIntent}
            onOpenTrip={(id) => openTrip(id)}
          />
        ) : (
          <ActivityTab
            items={items}
            loading={feed.isLoading}
            error={feed.error ? getApiErrorMessage(feed.error) : null}
            now={now}
            refreshing={feed.isRefetching}
            onRefresh={() => feed.refetch()}
            onOpen={openNotification}
            onMarkRead={markRead}
            canMarkAll={markable.length > 0}
            onMarkAllRead={markAllRead}
          />
        )}
      </View>

      <Toast visible={!!toast} message={toast?.message ?? ''} type={toast?.type ?? 'success'} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 4, padding: 3, borderRadius: 12, backgroundColor: '#EDEDF0', gap: 3 },
  tab: { flex: 1, height: 38, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  tabOn: { backgroundColor: Colors.white, borderWidth: 1, borderColor: LINE, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 14, fontWeight: '600', color: MUTED },
  tabTextOn: { color: INK },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCDCE0' },
  badgeOn: { backgroundColor: INK },
  badgeHot: { backgroundColor: '#D92D20' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#3F3F46', fontVariant: ['tabular-nums'] },
});
