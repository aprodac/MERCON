/**
 * Operator Home screen. Composes the dashboard feature's hooks + components
 * only — no direct API calls and no business logic live here.
 *
 * The bottom tab bar isn't rendered by this screen: it's mounted once, above
 * the route stack, in src/app/_layout.tsx (`<OperatorBottomNav />`), so every
 * operator screen shares one persistent nav instead of remounting it.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@mercon/mobile-shared/lib/auth-context';

import { useCurrentUser, useDashboardRefresh } from '../hooks';
import { useMarkNotificationsRead, useNotifications } from '@/features/notifications/hooks/useNotifications';
import { ScannerButton, SearchBar } from '../components';
import { HomeTopBar } from '../components/HomeTopBar';
import { OperatorSidebarDrawer } from '@/components/OperatorSidebarDrawer';
import { ErrorState } from '@mercon/mobile-shared/ui';
import { useActionInbox } from '../actions/useActionInbox';
import { ActionSummary, NeedsActionList, TodayTrips } from '../actions/NeedsAction';
import type { ActionGroup, ActionIntent } from '../actions/actionModel';

export default function DashboardHomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  // Ticks each minute so "12m late" / "in 2h" stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const { refreshing, refresh } = useDashboardRefresh();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | ActionGroup>('all');

  const currentUser = useCurrentUser();
  const notifications = useNotifications();
  const { markRead } = useMarkNotificationsRead();
  const inbox = useActionInbox();

  const firstName = (currentUser.data?.name ?? profile?.name ?? 'there').split(' ')[0];
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: inbox.tz, hour: '2-digit', hour12: false }).format(now)) % 24;
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Intl.DateTimeFormat('en-GB', { timeZone: inbox.tz, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F8' }} edges={['top']}>
      <View style={st.topBar}>
        <HomeTopBar unread={unreadCount} onMenu={() => setMenuOpen(true)} onNotifications={() => router.push('/notifications')} />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 120, gap: 18 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FA634E" />}
      >
        <View style={{ gap: 2 }}>
          <Text style={st.greeting} numberOfLines={1}>{greeting}, {firstName}</Text>
          <Text style={st.date}>{today}</Text>
        </View>

        <View className="flex-row items-center gap-2">
          <SearchBar value={search} onChangeText={setSearch} onSubmit={() => router.push('/trips')} />
          <ScannerButton />
        </View>

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
  topBar: { paddingHorizontal: 16, paddingBottom: 4, backgroundColor: '#F4F5F8' },
  greeting: { fontSize: 24, fontWeight: '800', color: '#2B2A2B', letterSpacing: -0.4 },
  date: { fontSize: 13, fontWeight: '600', color: '#5F5F6E' },
});
