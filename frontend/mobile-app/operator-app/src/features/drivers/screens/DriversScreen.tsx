/**
 * Operator Drivers screen. Composes the drivers feature's hooks + components
 * only — no direct API calls and no business logic live here.
 *
 * The bottom tab bar isn't rendered by this screen: it's mounted once, above
 * the route stack, in src/app/_layout.tsx (`<OperatorBottomNav />`).
 */
import React, { useEffect, useState } from 'react';
import { FlatList, Linking, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';

import { ListSearch, listPage } from '@/components/ListSearch';
import { EmptyState, ErrorState } from '@mercon/mobile-shared/ui';

import {
  DriverCard,
  DriverPagination,
  DriversHeader,
  DriverStatsSection,
  SkeletonDriverCard,
} from '../components';
import { useDriverFilters, useDriverSearch, useDrivers } from '../hooks';
import type { DriverListItem } from '../types';

export default function DriversScreen() {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { query, debouncedQuery, setQuery } = useDriverSearch();
  const { status, setStatus } = useDriverFilters();

  // Reset to page 1 whenever search query or status filter changes
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, status]);

  const {
    drivers,
    total,
    page: currentPage,
    totalPages,
    loading,
    error,
    refresh,
    isRefreshing,
    isFetching,
    hasNextPage,
    hasPrevPage,
  } = useDrivers({ search: debouncedQuery, status, sort: 'name', page, all: false });

  const isFiltered = Boolean(debouncedQuery || status);

  const openDriver = (driver: DriverListItem) => {
    router.push({ pathname: '/driver-details', params: { id: driver.id } });
  };

  return (
    <SafeAreaView style={listPage.page} edges={['top']}>
      <DriversHeader onAddPress={() => router.push('/driver-edit')} />

      {error ? (
        <ErrorState message={error} onRetry={() => refresh()} className="flex-1" />
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={listPage.list}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <View style={listPage.header}>
              <DriverStatsSection status={status} onSelect={setStatus} />
              <ListSearch
                value={query}
                onChangeText={setQuery}
                placeholder="Search name or phone"
                loading={isFetching && !isRefreshing}
              />
              {!loading ? <Text style={listPage.count}>{total} {total === 1 ? 'driver' : 'drivers'}</Text> : null}
            </View>
          }
          renderItem={({ item }) => (
            <DriverCard
              driver={item}
              onView={openDriver}
              onCall={(d) => d.phone && Linking.openURL(`tel:${d.phone}`).catch(() => {})}
              onTrack={(d) => d.activeTrip && router.push({ pathname: '/trip-details', params: { id: d.activeTrip.id } })}
            />
          )}
          ListEmptyComponent={
            loading ? (
              <View className="gap-3.5">
                <SkeletonDriverCard />
                <SkeletonDriverCard />
                <SkeletonDriverCard />
              </View>
            ) : isFiltered ? (
              <EmptyState
                title={debouncedQuery ? `No drivers match "${debouncedQuery}"` : 'No matching drivers'}
                subtitle="Try a different search or clear a filter."
                Icon={Users}
                className="mt-8"
              />
            ) : (
              <EmptyState
                title="No drivers registered"
                subtitle="No driver records have been added to the fleet yet."
                Icon={Users}
                className="mt-8"
              />
            )
          }
          ListFooterComponent={(
            <DriverPagination
              currentCount={drivers.length}
              totalCount={total}
              page={currentPage}
              totalPages={totalPages}
              hasPrevPage={hasPrevPage}
              hasNextPage={hasNextPage}
              isFetching={isFetching}
              onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
              onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
          )}
        />
      )}

    </SafeAreaView>
  );
}
