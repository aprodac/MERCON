/**
 * Operator Commercial Quotations — rate and lane lookup.
 * Status tiles that also filter (All · Active · Expired · Inactive), search,
 * then one compact row per quotation, sorted by origin. Tap a row for its page; + adds one.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Tag, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { QuotationRow, QuotationsHeader } from '../components';
import { useQuotations } from '../hooks';
import { sortQuotations } from '../services/quotationsService';

type Filter = 'all' | 'Active' | 'Expired' | 'Inactive';

const INK = '#18181B';
const MUTED = '#6B6B76';

const TILES: { id: Filter; label: string; dot?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Active', label: 'Active', dot: '#1F9D55' },
  { id: 'Expired', label: 'Expired', dot: '#D92D20' },
  { id: 'Inactive', label: 'Inactive', dot: '#9898A4' },
];

export default function QuotationsScreen() {
  const router = useRouter();
  const { quotations, loading, error, refresh, isRefreshing } = useQuotations();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => ({
    all: quotations.length,
    Active: quotations.filter((q) => q.validityStatus === 'Active').length,
    Expired: quotations.filter((q) => q.validityStatus === 'Expired').length,
    Inactive: quotations.filter((q) => q.validityStatus === 'Inactive').length,
  }), [quotations]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = quotations.filter((q) => {
      if (filter !== 'all' && q.validityStatus !== filter) return false;
      if (!needle) return true;
      return `${q.firstStop} ${q.lastStop} ${q.customerName} ${q.name} ${q.vehicleClass} ${q.quotationNumber ?? ''}`.toLowerCase().includes(needle);
    });
    return sortQuotations(list, 'route');
  }, [quotations, query, filter]);

  const first = loading && quotations.length === 0;

  return (
    <SafeAreaView style={s.page} edges={['top']}>
      <QuotationsHeader onAddPress={() => router.push('/quotation-edit')} />

      {error && quotations.length === 0 ? (
        <ErrorState message={error} onRetry={() => refresh()} className="flex-1" />
      ) : (
        <FlatList
          data={first ? [] : shown}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <View style={{ gap: 14, marginBottom: 14 }}>
              <View style={s.tiles}>
                {TILES.map((t) => {
                  const on = filter === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[s.tile, on && s.tileOn]}
                      activeOpacity={0.8}
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); setFilter(t.id); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[s.tileValue, on && { color: '#FFFFFF' }]}>{first ? '—' : counts[t.id]}</Text>
                      <View style={s.tileLabelRow}>
                        {t.dot ? <View style={[s.dot, { backgroundColor: t.dot }]} /> : null}
                        <Text style={[s.tileLabel, on && { color: '#D4D4D8' }]} numberOfLines={1}>{t.label}</Text>
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
                  placeholder="Search route, customer or truck type"
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

              {!first ? <Text style={s.count}>{shown.length} {shown.length === 1 ? 'quotation' : 'quotations'}</Text> : null}
            </View>
          }
          renderItem={({ item }) => (
            <QuotationRow quotation={item} onPress={() => router.push({ pathname: '/quotation-details', params: { id: item.id } })} />
          )}
          ListEmptyComponent={
            first ? (
              <View style={{ gap: 8 }}>
                {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={96} radius={16} />)}
              </View>
            ) : query || filter !== 'all' ? (
              <EmptyState title="No quotations match" subtitle="Try another search or clear the filter." Icon={Tag} className="mt-8" />
            ) : (
              <EmptyState title="No quotations yet" subtitle="Tap + to add the first rate." Icon={Tag} className="mt-8" />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F6F7' },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 12, paddingHorizontal: 10, gap: 3 },
  tileOn: { backgroundColor: INK, borderColor: INK },
  tileValue: { fontSize: 20, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  tileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tileLabel: { fontSize: 12, color: MUTED, flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15, color: INK, paddingVertical: 0 },
  count: { fontSize: 16, fontWeight: '700', color: INK },
});
