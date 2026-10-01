/**
 * Operator Drivers screen. Composes the drivers feature's hooks + components
 * only — no direct API calls and no business logic live here.
 *
 * The bottom tab bar isn't rendered by this screen: it's mounted once, above
 * the route stack, in src/app/_layout.tsx (`<OperatorBottomNav />`).
 */
import React, { useEffect, useMemo, useState } from 'react';
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
  NO_FLAGS,
  SkeletonDriverCard,
} from '../components';
import { useDriverFilters, useDriverSearch, useDriverSorting, useDrivers } from '../hooks';
import type { DriverFlags, DriverListItem } from '../types';
import { EXPIRY_SOON_DAYS } from '../services/driverDetailsService';

export default function DriversScreen() {
  const router = useRouter();
  const [filterVisible, setFilterVisible] = useState(false);
  const [page, setPage] = useState(1);

  const { query, debouncedQuery, setQuery } = useDriverSearch();
  const { status, setStatus } = useDriverFilters();
  const { sort, setSort } = useDriverSorting();
  const [flags, setFlags] = useState<DriverFlags>(NO_FLAGS);
  const anyFlag = flags.expiring || flags.noTruck;

  // Reset to page 1 whenever search query or status filter changes
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, status, flags, sort]);

  // Sorting other than by name, and the "show only" filters, need the whole
  // fleet — sorting or filtering one page of 10 would be wrong.
  const loadAllFlag = anyFlag || sort !== 'name';
  const {
    drivers: loaded,
    total: serverTotal,
    page: currentPage,
    totalPages,
    loading,
    error,
    refresh,
    isRefreshing,
    isFetching,
    hasNextPage,
    hasPrevPage,
  } = useDrivers({ search: debouncedQuery, status, sort, page, all: loadAllFlag });

  const soon = (d: number | null) => d !== null && d <= EXPIRY_SOON_DAYS;
  const drivers = useMemo(
    () => loaded.filter((d) =>
      (!flags.expiring || soon(d.licenseDaysLeft) || soon(d.docDaysLeft)) &&
      (!flags.noTruck || (!d.assignedVehicle && !d.activeTrip))),
    [loaded, flags],
  );
  const total = anyFlag ? drivers.length : serverTotal;

  const isFiltered = Boolean(debouncedQuery || status || anyFlag);

  const openDriver = (driver: DriverListItem) => {
    router.push({ pathname: '/driver-details', params: { id: driver.id } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F6F7' }} edges={['top']}>
      <DriversHeader
        onFilterPress={() => setFilterVisible(true)}
        filterActive={status !== null || anyFlag || sort !== 'name'}
      />

      {error ? (
        <ErrorState message={error} onRetry={() => refresh()} className="flex-1" />
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 110 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <View className="gap-4 pb-3">
              <DriverStatsSection status={status} onSelect={setStatus} />
              <SearchBar
                value={query}
                onChangeText={setQuery}
                placeholder="Search name or phone"
                isLoading={isFetching && !isRefreshing}
              />
              {anyFlag ? (
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {flags.expiring ? <ActiveChip label="Documents expiring" onClear={() => setFlags((f) => ({ ...f, expiring: false }))} /> : null}
                  {flags.noTruck ? <ActiveChip label="No truck" onClear={() => setFlags((f) => ({ ...f, noTruck: false }))} /> : null}
                </View>
              ) : null}
              <DriversListHeader total={total} sort={sort} />
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
          ListFooterComponent={loadAllFlag ? null : (
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

      <FilterBottomSheet
        visible={filterVisible}
        status={status}
        flags={flags}
        sort={sort}
        onApply={(st, fl, so) => { setStatus(st); setFlags(fl); setSort(so); }}
        onClose={() => setFilterVisible(false)}
      />
    </SafeAreaView>
  );
}

function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <TouchableOpacity
      onPress={onClear}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Clear filter ${label}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#18181B' }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>{label}</Text>
      <X size={13} color="#FFFFFF" strokeWidth={2.5} />
    </TouchableOpacity>
  );
}
