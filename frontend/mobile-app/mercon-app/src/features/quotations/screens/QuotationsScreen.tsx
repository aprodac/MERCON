/**
 * Operator Commercial Quotations screen. Composes the quotations feature's hooks + components.
 * Read-only rate & lane lookup for mobile operators.
 */
import React, { useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Tag, X } from 'lucide-react-native';
import { Colors } from '@/theme/tokens';

import { SearchBar } from '@/features/dashboard/components';
import { EmptyState, ErrorState } from '@/shared/components';

import {
  FilterBottomSheet,
  QuotationCard,
  QuotationDetailModal,
  QuotationPagination,
  QuotationsHeader,
  QuotationsListHeader,
  SkeletonQuotationCard,
} from '../components';
import { useQuotationFilters, useQuotationSearch, useQuotationSorting, useQuotations } from '../hooks';
import type { QuotationListItem } from '../types';

export default function QuotationsScreen() {
  const navigation = useNavigation();
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<QuotationListItem | null>(null);
  const [page, setPage] = useState(1);

  const { query, debouncedQuery, setQuery } = useQuotationSearch();
  const { status, setStatus } = useQuotationFilters();
  const { sort, setSort } = useQuotationSorting();

  // Reset to page 1 whenever search query or status filter changes
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, status]);

  const {
    quotations,
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
  } = useQuotations({ search: debouncedQuery, status, sort, page });

  const isFiltered = Boolean(debouncedQuery || status !== 'all');

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
      <QuotationsHeader
        onFilterPress={() => setFilterVisible(true)}
        onMenuPress={handleMenuPress}
        filterActive={status !== 'all'}
      />

      {error ? (
        <ErrorState message={error} onRetry={() => refresh()} className="flex-1" />
      ) : (
        <FlatList
          data={quotations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 110 }}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <View className="gap-4 pb-3">
              <SearchBar
                value={query}
                onChangeText={setQuery}
                placeholder="Search quotations by route or customer…"
                isLoading={isFetching && !isRefreshing}
              />
              {status !== 'all' && (
                <View className="flex-row items-center">
                  <TouchableOpacity
                    onPress={() => setStatus('all')}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Clear ${status} status filter`}
                    className="flex-row items-center gap-1.5 rounded-full bg-[#FFF0EB] px-3 py-1 border border-[#FDE3DF]"
                  >
                    <Text style={{ color: Colors.primary }} className="text-[12px] font-bold">
                      Status: {status}
                    </Text>
                    <X size={12} color={Colors.primary} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              )}
              <QuotationsListHeader total={total} sort={sort} onSortChange={setSort} />
            </View>
          }
          renderItem={({ item }) => (
            <QuotationCard
              quotation={item}
              onView={(q) => setSelectedQuotation(q)}
            />
          )}
          ListEmptyComponent={
            loading ? (
              <View className="gap-3.5">
                <SkeletonQuotationCard />
                <SkeletonQuotationCard />
                <SkeletonQuotationCard />
              </View>
            ) : isFiltered ? (
              <EmptyState
                title={debouncedQuery ? `No quotations match "${debouncedQuery}"` : 'No matching quotations'}
                subtitle="Try adjusting your search query or status filter."
                Icon={Tag}
                className="mt-8"
              />
            ) : (
              <EmptyState
                title="No commercial quotations"
                subtitle="No rate cards have been configured yet."
                Icon={Tag}
                className="mt-8"
              />
            )
          }
          ListFooterComponent={
            <QuotationPagination
              currentCount={quotations.length}
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

      <QuotationDetailModal
        visible={Boolean(selectedQuotation)}
        quotation={selectedQuotation}
        onClose={() => setSelectedQuotation(null)}
      />
    </SafeAreaView>
  );
}
