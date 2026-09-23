/**
 * Operator Vehicles screen. Composes the vehicles feature's hooks + components.
 * Presentation only: network requests, transforms, and state management live in the feature layer.
 */
import React, { useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Truck, X } from 'lucide-react-native';
import { Colors } from '@/theme/tokens';

import { SearchBar } from '@/features/dashboard/components';
import { EmptyState, ErrorState } from '@/shared/components';

import {
  FilterBottomSheet,
  SkeletonVehicleCard,
  VehicleCard,
  VehiclePagination,
  VehiclesHeader,
  VehiclesListHeader,
  VehicleStatsSection,
} from '../components';
import { useVehicleFilters, useVehicleSearch, useVehicleSorting, useVehicles } from '../hooks';
import type { VehicleListItem } from '../types';

export default function VehiclesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [filterVisible, setFilterVisible] = useState(false);
  const [page, setPage] = useState(1);

  const { query, debouncedQuery, setQuery } = useVehicleSearch();
  const { status, setStatus } = useVehicleFilters();
  const { sort, setSort } = useVehicleSorting();

  // Reset to page 1 whenever search query or status filter changes
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, status]);

  const {
    vehicles,
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
  } = useVehicles({ search: debouncedQuery, status, sort, page });

  const isFiltered = Boolean(debouncedQuery || status);

  const openVehicle = (vehicle: VehicleListItem) => {
    router.push({ pathname: '/operator/vehicle-edit', params: { id: vehicle.id } });
  };

  const openTrip = (tripId: string) => {
    router.push({ pathname: '/operator/trip-details', params: { id: tripId } });
  };

  const handleMenuPress = () => {
    try {
      navigation.dispatch(DrawerActions.openDrawer());
    } catch {
      try {
        (navigation as any).getParent?.()?.openDrawer?.();
      } catch {}
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['top']}>
      <VehiclesHeader
        onFilterPress={() => setFilterVisible(true)}
        onMenuPress={handleMenuPress}
        filterActive={status !== null}
      />

      {error ? (
        <ErrorState message={error} onRetry={() => refresh()} className="flex-1" />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 110 }}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <View className="gap-4 pb-3">
              <VehicleStatsSection />
              <SearchBar
                value={query}
                onChangeText={setQuery}
                placeholder="Search vehicles by plate or asset type…"
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
                      Status: {status === 'OnTrip' ? 'On Trip' : status}
                    </Text>
                    <X size={12} color={Colors.primary} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              )}
              <VehiclesListHeader total={total} sort={sort} onSortChange={setSort} />
            </View>
          }
          renderItem={({ item }) => (
            <VehicleCard
              vehicle={item}
              onView={openVehicle}
              onTrackTrip={openTrip}
            />
          )}
          ListEmptyComponent={
            loading ? (
              <View className="gap-3.5">
                <SkeletonVehicleCard />
                <SkeletonVehicleCard />
                <SkeletonVehicleCard />
              </View>
            ) : isFiltered ? (
              <EmptyState
                title={debouncedQuery ? `No vehicles match "${debouncedQuery}"` : 'No matching vehicles'}
                subtitle="Try adjusting your search query or status filter."
                Icon={Truck}
                className="mt-8"
              />
            ) : (
              <EmptyState
                title="No vehicles registered"
                subtitle="No vehicle records have been added to the fleet yet."
                Icon={Truck}
                className="mt-8"
              />
            )
          }
          ListFooterComponent={
            <VehiclePagination
              currentCount={vehicles.length}
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
