/**
 * Operator Home screen. Composes the dashboard feature's hooks + components
 * only — no direct API calls and no business logic live here.
 *
 * The bottom tab bar isn't rendered by this screen: it's mounted once, above
 * the route stack, in src/app/_layout.tsx (`<OperatorBottomNav />`), so every
 * operator screen shares one persistent nav instead of remounting it.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';


import { useDashboardRefresh } from '../hooks';
import { useMarkNotificationsRead, useNotifications } from '@/features/notifications/hooks/useNotifications';
import { HomeTopBar } from '../components/HomeTopBar';
import { OperatorSidebarDrawer } from '@/components/OperatorSidebarDrawer';
import { ErrorState } from '@mercon/mobile-shared/ui';
import { useActionInbox } from '../actions/useActionInbox';
import { ActionSummary, NeedsActionList, TodayTrips } from '../actions/NeedsAction';
import type { ActionGroup, ActionIntent } from '../actions/actionModel';

export default function DashboardHomeScreen() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  // Ticks each minute so "12m late" / "in 2h" stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const { refreshing, refresh } = useDashboardRefresh();
  const [filter, setFilter] = useState<'all' | ActionGroup>('all');

  const notifications = useNotifications();
  const { markRead } = useMarkNotificationsRead();
  const inbox = useActionInbox();

  const unreadCount = notifications.data?.filter((n) => !n.is_read).length ?? 0;

  const openTrip = (id: string, extra: Record<string, string> = {}) =>
    router.push({ pathname: '/trip-details', params: { id, ...extra } });

  const onIntent = (intent: ActionIntent) => {
    switch (intent.type) {
      case 'call':
        Linking.openURL(`tel:${intent.phone}`).catch(() => {});
        return;
      case 'whatsapp':
        Linking.openURL(`https://wa.me/${(intent.phone ?? '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(intent.text)}`)
          .catch(() => Alert.alert('Could not open WhatsApp'));
        return;
      case 'trip': {
        const extra: Record<string, string> = {};
        if (intent.tab) extra.tab = intent.tab;
        if (intent.share) extra.share = intent.share;
        if (intent.assign) extra.assign = intent.assign;
        openTrip(intent.tripId, extra);
        return;
      }
      case 'handled':
        markRead(intent.notificationId);
        return;
      case 'driver':
        router.push({ pathname: '/driver-details', params: { id: intent.id } });
        return;
      case 'vehicle':
        router.push({ pathname: '/vehicle-edit', params: { id: intent.id } });
        return;
      case 'invoices':
        router.push('/invoices');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }} edges={['top']}>
      <View style={st.topBar}>
        <HomeTopBar unread={unreadCount} onMenu={() => setMenuOpen(true)} onSearch={() => router.push('/trips')} onNotifications={() => router.push('/notifications')} />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FA634E" />}
      >
        <ActionSummary
          running={inbox.counts.running}
          delayed={inbox.counts.delayed}
          actNow={inbox.counts.now}
          onRunning={() => router.push('/trips')}
          onDelayed={() => setFilter('trips')}
          onActNow={() => setFilter('all')}
        />

        {inbox.liveError ? (
          <ErrorState message="Couldn't load live trips." onRetry={inbox.retry} />
        ) : null}

        <NeedsActionList
          items={inbox.items}
          loading={inbox.loading}
          onIntent={onIntent}
          onOpenTrip={(id) => openTrip(id)}
          filter={filter}
          onFilter={setFilter}
          now={now}
        />

        <TodayTrips rows={inbox.today} tz={inbox.tz} onOpenTrip={(id) => openTrip(id)} onAll={() => router.push('/trips')} />
      </ScrollView>
      <OperatorSidebarDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} side="left" />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  topBar: { paddingHorizontal: 16, paddingBottom: 6, backgroundColor: '#FAFAFA' },
});
