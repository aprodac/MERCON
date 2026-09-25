/**
 * Operator Home screen. Composes the dashboard feature's hooks + components
 * only — no direct API calls and no business logic live here.
 *
 * The bottom tab bar isn't rendered by this screen: it's mounted once, above
 * the route stack, in src/app/_layout.tsx (`<OperatorBottomNav />`), so every
 * operator screen shares one persistent nav instead of remounting it.
 */
import React, { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@mercon/mobile-shared/lib/auth-context';

import {
  useActiveTrips, useCurrentUser, useDashboardRefresh,
  useDashboardSummary, useDelayedDeliveries, useOperatorCommandQueue,
} from '../hooks';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import {
  AppHeader, DashboardMetricCard,
  OperatorCommandCenterSection, ScannerButton, SearchBar,
} from '../components';
import { ErrorState, SkeletonMetricCard } from '@mercon/mobile-shared/ui';

export default function DashboardHomeScreen() {
  const router = useRouter();
  const { role } = useAuth();
  const { refreshing, refresh } = useDashboardRefresh();

  const [search, setSearch] = useState('');

  const currentUser = useCurrentUser();
  const notifications = useNotifications();
  const summary = useDashboardSummary();
  const activeTrips = useActiveTrips();
  const delayedDeliveries = useDelayedDeliveries();
  const { counts } = useOperatorCommandQueue();

  const firstName = (currentUser.data?.name ?? 'Operator').split(' ')[0];
  const unreadCount = notifications.data?.filter((n) => !n.is_read).length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FA634E" />}
      >
        {/* 1. AppHeader */}
        <AppHeader
          logoSource={require('@mercon/mobile-shared/assets/images/mercon-logo.png')}
          greeting="Welcome back,"
          userName={firstName}
          role={role ?? 'Operator'}
          unreadNotifications={unreadCount}
          onNotificationPress={() => router.push('/notifications')}
        />

        {/* 2. Search Row */}
        <View className="flex-row items-center gap-2">
          <SearchBar value={search} onChangeText={setSearch} onSubmit={() => router.push('/trips')} />
          <ScannerButton />
        </View>

        {/* 3. Dashboard Metrics */}
        {summary.isLoading || activeTrips.isLoading || delayedDeliveries.isLoading ? (
          <View className="flex-col gap-3">
            <View className="flex-row gap-3">
              <SkeletonMetricCard />
              <SkeletonMetricCard />
            </View>
            <View className="flex-row gap-3">
              <SkeletonMetricCard />
            </View>
          </View>
        ) : summary.isError ? (
          <ErrorState message="Couldn't load dashboard metrics." onRetry={() => summary.refetch()} />
        ) : (
          <View className="flex-col gap-3">
            <View className="flex-row gap-3">
              <DashboardMetricCard
                title="Active Trips"
                value={activeTrips.data?.length ?? 0}
                image={require('@/assets/images/mobile-truck.webp')}
                onPress={() => router.push('/trips')}
              />
              <DashboardMetricCard
                title="Delayed Deliveries"
                value={delayedDeliveries.data?.length ?? 0}
                onPress={() => router.push('/trips')}
              />
            </View>
            <View className="flex-row gap-3">
              <DashboardMetricCard
                title="POD Pending"
                value={counts.pod ?? 0}
                onPress={() => router.push('/trips')}
              />
            </View>
          </View>
        )}

        {/* 4. UNIFIED OPERATOR COMMAND CENTER */}
        <OperatorCommandCenterSection
          onTripPress={(tripId) => router.push({ pathname: '/trip-details', params: { id: tripId } })}
        />
      </ScrollView>
    </SafeAreaView>
  );
}


