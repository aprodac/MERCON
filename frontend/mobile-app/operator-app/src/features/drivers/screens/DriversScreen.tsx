/**
 * Operator Drivers screen. Composes the drivers feature's hooks + components
 * only — no direct API calls and no business logic live here.
 *
 * The bottom tab bar isn't rendered by this screen: it's mounted once, above
 * the route stack, in src/app/_layout.tsx (`<OperatorBottomNav />`).
 */
import React, { useEffect, useState } from 'react';
import { FlatList, Linking, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, X } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';

import { SearchBar } from '@/features/dashboard/components';
import { EmptyState, ErrorState } from '@mercon/mobile-shared/ui';

import {
  DriverCard,
  DriverPagination,
  DriversHeader,
  DriversListHeader,
  DriverStatsSection,
  FilterBottomSheet,
  SkeletonDriverCard,
} from '../components';
import { useDriverFilters, useDriverSearch, useDriverSorting, useDrivers } from '../hooks';
import type { DriverListItem } from '../types';

export default function DriversScreen() {
  const router = useRouter();
  const [filterVisible, setFilterVisible] = useState(false);
  const [page, setPage] = useState(1);

  const { query, debouncedQuery, setQuery } = useDriverSearch();
  const { status, setStatus } = useDriverFilters();
  const { sort, setSort } = useDriverSorting();

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
  } = useDrivers({ search: debouncedQuery, status, sort, page });

  const isFiltered = Boolean(debouncedQuery || status);

  const openDriver = (driver: DriverListItem) => {
    router.push({ pathname: '/driver-details', params: { id: driver.id } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['top']}>
      <DriversHeader
        onFilterPress={() => setFilterVisible(true)}
        filterActive={status !== null}
      />

      {error ? (
        <ErrorState message={error} onRetry={() => refresh()} className="flex-1" />
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 110 }}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <View className="gap-4 pb-3">
              <DriverStatsSection />
              <SearchBar
                value={query}
                onChangeText={setQuery}
                placeholder="Search drivers by name or phone…"
                isLoading={isFetching && !isRefreshing}
              />
              {status !== null && (
                <View className="flex-row items-center">
                  <TouchableOpacity
                    onPress={() => setStatus(null)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Clear ${status} status filter`}
                    className="flex-row items-center gap-1.5 rounded-full bg-[#FFF0EB] px-3 py-1 border border-[#FDE3DF]"
                  >
                    <Text style={{ color: Colors.primary }} className="text-[12px] font-bold">
                      Status: {status === 'OnTrip' ? 'On Trip' : status === 'OffDuty' ? 'Offline' : status}
                    </Text>
                    <X size={12} color={Colors.primary} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              )}
              <DriversListHeader total={total} sort={sort} onSortChange={setSort} />
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
                subtitle="Try adjusting your search query or status filter."
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
          ListFooterComponent={
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
          }
        />
      )}

      <FilterBottomSheet
        visible={filterVisible}
        value={status}
        onChange={setStatus}
        onClose={() => setFilterVisible(false)}
      />
    </SafeAreaView>
  );
}

