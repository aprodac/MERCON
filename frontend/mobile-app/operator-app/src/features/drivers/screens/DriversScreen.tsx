/**
 * Operator Drivers screen. Composes the drivers feature's hooks + components
 * only — no direct API calls and no business logic live here.
 *
 * The bottom tab bar isn't rendered by this screen: it's mounted once, above
 * the route stack, in src/app/_layout.tsx (`<OperatorBottomNav />`).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlatList, Linking, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, X } from 'lucide-react-native';
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
import { fleetPhoneKey, fleetPhoneStatus } from '../phone/driverPhone';
import { PHONE_GROUP_LABEL, PhoneSummary, phoneGroupOf, type PhoneGroup } from '../phone/PhoneSummary';

export default function DriversScreen() {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { query, debouncedQuery, setQuery } = useDriverSearch();
  const { status, setStatus } = useDriverFilters();
  // A tapped number on the phone summary ("Not installed") lists just those drivers.
  const [phoneGroup, setPhoneGroup] = useState<PhoneGroup | null>(null);

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
  } = useDrivers({ search: debouncedQuery, status, sort: 'name', page, all: phoneGroup != null });

  // Every driver's phone (the driver app): ready / check / not ready, refreshed every minute.
  const phones = useQuery({ queryKey: fleetPhoneKey, queryFn: fleetPhoneStatus, refetchInterval: 60_000, staleTime: 30_000 });
  const phoneOf = useMemo(() => new Map((phones.data ?? []).map((p) => [p.driverId, p])), [phones.data]);
  // The phone group is a filter over every driver (loaded in one go), not one page.
  const listed = useMemo(
    () => (phoneGroup ? drivers.filter((d) => { const p = phoneOf.get(d.id); return p ? phoneGroupOf(p) === phoneGroup : false; }) : drivers),
    [drivers, phoneGroup, phoneOf],
  );
  const isFiltered = Boolean(debouncedQuery || status || phoneGroup);

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
          data={listed}
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
              {!loading ? <PhoneSummary shown={phoneGroup ? listed.length : total} filtered={isFiltered} rows={phones.data} group={phoneGroup} onGroup={setPhoneGroup} /> : null}
              {phoneGroup ? (
                <TouchableOpacity
                  onPress={() => setPhoneGroup(null)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#3E3C3D' }}
                  accessibilityRole="button"
                  accessibilityLabel="Show all drivers"
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>{PHONE_GROUP_LABEL[phoneGroup]} · {listed.length}</Text>
                  <X size={13} color="#FFFFFF" />
                </TouchableOpacity>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <DriverCard
              driver={item}
              phone={phones.data ? phoneOf.get(item.id) ?? null : undefined}
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
          ListFooterComponent={phoneGroup ? null : (
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
