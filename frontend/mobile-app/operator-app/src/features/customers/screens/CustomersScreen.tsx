/**
 * Customers — the companies trips are done for. Route: /customers.
 *
 * Status tiles that also filter (All · Active · Inactive), search, then one
 * compact row per customer; + adds one. Presentation only: every request,
 * transform and side effect lives in the feature's hooks.
 */
import React, { useCallback } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus, Search, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { AppTopBar } from '@/components/AppTopBar';
import { customersApi } from '../api/customersApi';
import { CustomerRow } from '../components/CustomerRow';
import { isDemoCustomer } from '../services/customersService';
import { useCustomerActions, useCustomerFilters, useCustomerPermissions, useCustomers, useCustomerSearch } from '../hooks';
import type { CustomerListItem, CustomerStatusFilter } from '../types';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

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
            <View style={{ gap: 14, marginBottom: 14 }}>
              <View style={s.tiles}>
                {TILES.map((t) => {
                  const on = status === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[s.tile, on && s.tileOn]}
                      activeOpacity={0.8}
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); setStatus(t.id); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[s.tileValue, on && { color: '#FFFFFF' }]}>{counts[t.id] ?? '—'}</Text>
                      <View style={s.tileLabelRow}>
                        {t.dot ? <View style={[s.dot, { backgroundColor: t.dot }]} /> : null}
                        <Text style={[s.tileLabel, on && { color: '#D4D4D8' }]}>{t.label}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={s.search}>
                <Search size={17} color={MUTED} />
                <TextInput
                  style={s.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search customer name"
                  placeholderTextColor="#9898A4"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {query ? (
                  <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
                    <X size={17} color={MUTED} />
                  </TouchableOpacity>
                ) : null}
              </View>

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

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F6F7' },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 12, paddingHorizontal: 12, gap: 3 },
  tileOn: { backgroundColor: INK, borderColor: INK },
  tileValue: { fontSize: 20, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  tileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tileLabel: { fontSize: 12, color: MUTED },
  dot: { width: 7, height: 7, borderRadius: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15, color: INK, paddingVertical: 0 },
  count: { fontSize: 16, fontWeight: '700', color: INK },
});
