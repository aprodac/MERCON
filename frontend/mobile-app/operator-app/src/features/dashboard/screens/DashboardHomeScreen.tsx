/**
 * Operator Home screen. Composes the dashboard feature's hooks + components
 * only — no direct API calls and no business logic live here.
 *
 * The bottom tab bar isn't rendered by this screen: it's mounted once, above
 * the route stack, in src/app/_layout.tsx (`<OperatorBottomNav />`), so every
 * operator screen shares one persistent nav instead of remounting it.
 */
import React, { useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@mercon/mobile-shared/lib/auth-context';

import { useCurrentUser, useDashboardRefresh } from '../hooks';
import { useMarkNotificationsRead, useNotifications } from '@/features/notifications/hooks/useNotifications';
import { AppHeader, ScannerButton, SearchBar } from '../components';
import { ErrorState } from '@mercon/mobile-shared/ui';
import { useActionInbox } from '../actions/useActionInbox';
import { ActionSummary, NeedsActionList, TodayTrips } from '../actions/NeedsAction';
import type { ActionGroup, ActionIntent } from '../actions/actionModel';

export default function DashboardHomeScreen() {
  const router = useRouter();
  const { role } = useAuth();
  const { refreshing, refresh } = useDashboardRefresh();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | ActionGroup>('all');

  const currentUser = useCurrentUser();
  const notifications = useNotifications();
  const { markRead } = useMarkNotificationsRead();
  const inbox = useActionInbox();

  const firstName = (currentUser.data?.name ?? 'Operator').split(' ')[0];
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FA' }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 18 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FA634E" />}
      >
        <AppHeader
          logoSource={require('@mercon/mobile-shared/assets/images/mercon-logo.png')}
          greeting="Welcome back,"
          userName={firstName}
          role={role ?? 'Operator'}
          unreadNotifications={unreadCount}
          onNotificationPress={() => router.push('/notifications')}
        />

        <View className="flex-row items-center gap-2">
          <SearchBar value={search} onChangeText={setSearch} onSubmit={() => router.push('/trips')} />
          <ScannerButton />
        </View>

        <ActionSummary
          running={inbox.counts.running}
          delayed={inbox.counts.delayed}
          action={inbox.counts.action}
          onRunning={() => router.push('/trips')}
          onDelayed={() => setFilter('trips')}
          onAction={() => setFilter('all')}
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
        />

        <TodayTrips rows={inbox.today} tz={inbox.tz} onOpenTrip={(id) => openTrip(id)} onAll={() => router.push('/trips')} />
      </ScrollView>
    </SafeAreaView>
  );
}
