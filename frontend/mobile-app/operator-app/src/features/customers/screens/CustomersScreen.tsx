/**
 * Customers — the companies trips are done for. Route: /customers.
 *
 * A slim status filter (All · Active · Inactive), search, then one
 * compact row per customer; + adds one. Presentation only: every request,
 * transform and side effect lives in the feature's hooks.
 */
import React, { useCallback } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { AppTopBar } from '@/components/AppTopBar';
import { FilterChips } from '@/components/FilterChips';
import { ListSearch, listPage as s } from '@/components/ListSearch';
import { customersApi } from '../api/customersApi';
import { CustomerRow } from '../components/CustomerRow';
import { isDemoCustomer } from '../services/customersService';
import { useCustomerActions, useCustomerFilters, useCustomerPermissions, useCustomers, useCustomerSearch } from '../hooks';
import type { CustomerListItem, CustomerStatusFilter } from '../types';

const TILES: { id: CustomerStatusFilter; label: string; dot?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active', dot: '#1F9D55' },
  { id: 'inactive', label: 'Inactive', dot: '#9898A4' },
];

/** How many customers there are in each status. */
function useCustomerCounts() {
  // One request per status; the hidden demo rows (see isDemoCustomer) are left out of the count.
  const count = (is_active?: boolean) => async () => {
    const res = await customersApi.getCustomers({ page: 1, per_page: 200, is_active });
    return res.meta.total - res.data.filter(isDemoCustomer).length;
  };
  const all = useQuery({ queryKey: ['customers', 'count', 'all'], queryFn: count() });
  const active = useQuery({ queryKey: ['customers', 'count', 'active'], queryFn: count(true) });
  const inactive = useQuery({ queryKey: ['customers', 'count', 'inactive'], queryFn: count(false) });
  return {
    counts: { all: all.data, active: active.data, inactive: inactive.data } as Record<CustomerStatusFilter, number | undefined>,
    refresh: () => { all.refetch(); active.refetch(); inactive.refetch(); },
  };
}

export default function CustomersScreen() {
  const router = useRouter();
  const { query, setQuery, debouncedQuery } = useCustomerSearch();
  const { status, setStatus } = useCustomerFilters();
  const {
    customers, total, loading, error, refresh, isRefreshing, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useCustomers({ search: debouncedQuery, status, sort: 'name' });
  const { counts, refresh: refreshCounts } = useCustomerCounts();
  const permissions = useCustomerPermissions();
  const { toggleActive, deleteCustomer } = useCustomerActions();

  const renderItem = useCallback(
    ({ item }: { item: CustomerListItem }) => (
      <CustomerRow
        customer={item}
        permissions={permissions}
        onPress={() => router.push({ pathname: '/customer-details', params: { id: item.id } })}
        onEdit={() => router.push({ pathname: '/customer-edit', params: { id: item.id } })}
        onToggleActive={() => toggleActive(item)}
        onDelete={() => deleteCustomer(item)}
      />
    ),
    [permissions, router, toggleActive, deleteCustomer],
  );

  return (
    <SafeAreaView edges={['top']} style={s.page}>
      <AppTopBar
        title="Customers"
        actions={permissions.canCreate ? [{ icon: Plus, label: 'Add customer', onPress: () => router.push('/customer-edit') }] : []}
      />

      {error ? (
        <ErrorState message={error} onRetry={refresh} className="flex-1" />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { refresh(); refreshCounts(); }} tintColor={Colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
          ListHeaderComponent={
            <View style={s.header}>
              <FilterChips<CustomerStatusFilter>
                value={status}
                onChange={setStatus}
                items={TILES.map((t) => ({ key: t.id, label: t.label, dot: t.dot, count: counts[t.id] ?? '–' }))}
              />

              <ListSearch value={query} onChangeText={setQuery} placeholder="Search customer name" />

              {!loading ? <Text style={s.count}>{total} {total === 1 ? 'customer' : 'customers'}</Text> : null}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={{ gap: 8 }}>
                {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={86} radius={16} />)}
              </View>
            ) : (
              <EmptyState
                Icon={Building2}
                title="No customers found"
                subtitle={debouncedQuery || status !== 'all' ? 'Try another name or clear the filter.' : 'Tap + to add your first customer.'}
                className="mt-8"
              />
            )
          }
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 16 }} /> : null}
        />
      )}
    </SafeAreaView>
  );
}
