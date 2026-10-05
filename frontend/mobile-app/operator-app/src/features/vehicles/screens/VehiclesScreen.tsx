/**
 * Operator Vehicles screen. Composes the vehicles feature's hooks + components.
 * Presentation only: network requests, transforms, and state management live in the feature layer.
 */
import React, { useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Truck } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';

import { ListSearch, listPage } from '@/components/ListSearch';
import { EmptyState, ErrorState } from '@mercon/mobile-shared/ui';

import {
  SkeletonVehicleCard,
  VehicleCard,
  VehiclePagination,
  VehiclesHeader,
  VehiclesListHeader,
  VehicleStatusTabs,
} from '../components';
import { useVehicleFilters, useVehicleSearch, useVehicles } from '../hooks';
import type { VehicleListItem } from '../types';

export default function VehiclesScreen() {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { query, debouncedQuery, setQuery } = useVehicleSearch();
  const { status, setStatus } = useVehicleFilters();

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
  } = useVehicles({ search: debouncedQuery, status, page });

  const isFiltered = Boolean(debouncedQuery || status);

  const openVehicle = (vehicle: VehicleListItem) => {
    router.push({ pathname: '/vehicle-details', params: { id: vehicle.id } });
  };

  const openTrip = (tripId: string) => {
    router.push({ pathname: '/trip-details', params: { id: tripId } });
  };

  return (
    <SafeAreaView style={listPage.page} edges={['top']}>
      <VehiclesHeader onAddPress={() => router.push('/vehicle-edit')} />

      {error ? (
        <ErrorState message={error} onRetry={() => refresh()} className="flex-1" />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={listPage.list}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <View style={listPage.header}>
              <VehicleStatusTabs value={status} onChange={setStatus} />
              <ListSearch
                value={query}
                onChangeText={setQuery}
                placeholder="Search plate or truck type"
                loading={isFetching && !isRefreshing}
              />
              {!loading ? <VehiclesListHeader total={total} /> : null}
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

    </SafeAreaView>
  );
}
