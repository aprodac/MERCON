/**
 * 3rd party fleet — the subcontracted carriers (3PL) trips can be handed to.
 * Totals on top, search, then one card per carrier; tap a card for its
 * details, + adds a carrier. Same data as the web's Third-Party page.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, TextInput, StyleSheet, StatusBar, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Building2, ChevronRight, Phone, Plus, Search, X } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { operatorService, useOperatorThirdPartyProviders, type OperatorThirdPartyProvider, type ThirdPartyStats } from '@/lib/operator';
import { AppTopBar } from '@/components/AppTopBar';
import { initialsOf, niceName, tap } from '@/features/trips/create/components/ui';
import { compactSar } from '../format';

type Filter = 'all' | 'active' | 'inactive';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
];

export default function ThirdPartyScreen() {
  const router = useRouter();
  const { providers, loading, error, refetch } = useOperatorThirdPartyProviders();
  const [stats, setStats] = useState<ThirdPartyStats | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const loadStats = useCallback(() => {
    operatorService.thirdPartyStats().then(setStats).catch(() => {});
  }, []);

  // Coming back from Add / Edit shows the change straight away.
  useFocusEffect(
    useCallback(() => {
      refetch();
      loadStats();
    }, [refetch, loadStats]),
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers.filter((p) => {
      const active = p.isActive ?? true;
      if (filter === 'active' && !active) return false;
      if (filter === 'inactive' && active) return false;
      if (!q) return true;
      return `${p.name} ${p.contact_person ?? ''} ${p.phone ?? ''}`.toLowerCase().includes(q);
    });
  }, [providers, query, filter]);

  const first = loading && providers.length === 0;

  return (
    <SafeAreaView style={s.page} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F6F7" />
      <AppTopBar
        title="3rd party fleet"
        actions={[{ icon: Plus, label: 'Add carrier', onPress: () => router.push('/third-party-edit') }]}
      />

      {error && providers.length === 0 ? (
        <ErrorState message={error} onRetry={refetch} className="flex-1" />
      ) : (
        <FlatList
          data={first ? [] : shown}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={loading && providers.length > 0} onRefresh={() => { refetch(); loadStats(); }} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <View style={{ gap: 14, marginBottom: 14 }}>
              <View style={s.stats}>
                <Stat label="Carriers" value={stats ? String(stats.total) : '—'} sub={stats ? `${stats.active} active` : undefined} />
                <Stat label="Trips given" value={stats ? String(stats.total_trips) : '—'} />
                <Stat label="Paid out" value={stats ? compactSar(stats.total_cost) : '—'} sub="SAR" />
              </View>

              <View style={s.search}>
                <Search size={17} color="#6B6B76" />
                <TextInput
                  style={s.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search carrier, contact or phone"
                  placeholderTextColor="#9898A4"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {query ? (
                  <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
                    <X size={17} color="#6B6B76" />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={s.filters}>
                {FILTERS.map((f) => {
                  const on = f.id === filter;
                  return (
                    <TouchableOpacity key={f.id} style={[s.filter, on && s.filterOn]} activeOpacity={0.8} onPress={() => { if (!on) tap(); setFilter(f.id); }}>
                      <Text style={[s.filterText, on && s.filterTextOn]}>{f.label}</Text>
                    </TouchableOpacity>
                  );
                })}
                <Text style={s.count}>{first ? '' : `${shown.length} ${shown.length === 1 ? 'carrier' : 'carriers'}`}</Text>
              </View>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <ProviderCard provider={item} onPress={() => router.push({ pathname: '/third-party-details', params: { id: item.id } })} />
          )}
          ListEmptyComponent={
            first ? (
              <View style={{ gap: 10 }}>
                {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={96} radius={16} />)}
              </View>
            ) : query || filter !== 'all' ? (
              <EmptyState title="No carriers match" subtitle="Try another name or clear the filter." Icon={Building2} className="mt-8" />
            ) : (
              <EmptyState title="No 3rd party carriers yet" subtitle="Tap + to add the first subcontractor." Icon={Building2} className="mt-8" />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={s.statValue} numberOfLines={1}>{value}</Text>
      <Text style={s.statSub} numberOfLines={1}>{sub ?? ' '}</Text>
    </View>
  );
}

function ProviderCard({ provider: p, onPress }: { provider: OperatorThirdPartyProvider; onPress: () => void }) {
  const active = p.isActive ?? true;
  const trips = p.total_trips ?? p._count?.subcontracts ?? 0;
  const running = p.active_trips ?? 0;
  return (
    <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={onPress}>
      <View style={s.cardTop}>
        <View style={s.avatar}><Text style={s.avatarText}>{initialsOf(p.name)}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>{niceName(p.name)}</Text>
          <Text style={s.contact} numberOfLines={1}>{niceName(p.contact_person) || p.phone || 'No contact saved'}</Text>
        </View>
        {p.phone ? (
          <TouchableOpacity
            style={s.call}
            onPress={() => Linking.openURL(`tel:${p.phone}`).catch(() => {})}
            hitSlop={6}
            accessibilityLabel={`Call ${p.name}`}
          >
            <Phone size={16} color="#18181B" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
        <ChevronRight size={18} color="#B4B4BD" />
      </View>
      <View style={s.cardFoot}>
        <View style={[s.pill, { backgroundColor: active ? '#E7F6EC' : '#F1F1F3' }]}>
          <View style={[s.pillDot, { backgroundColor: active ? '#1F9D55' : '#9898A4' }]} />
          <Text style={[s.pillText, { color: active ? '#146C3B' : '#6B6B76' }]}>{active ? 'Active' : 'Inactive'}</Text>
        </View>
        {running > 0 ? (
          <View style={[s.pill, { backgroundColor: '#E6F1FB' }]}>
            <Text style={[s.pillText, { color: '#185FA5' }]}>{running} running now</Text>
          </View>
        ) : null}
        <Text style={s.trips}>{trips} {trips === 1 ? 'trip' : 'trips'}{Number(p.total_cost) > 0 ? ` · SAR ${compactSar(Number(p.total_cost))}` : ''}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F6F7' },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 12, paddingVertical: 12 },
  statLabel: { fontSize: 12, color: '#6B6B76', fontWeight: '500' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#18181B', marginTop: 4, letterSpacing: -0.4 },
  statSub: { fontSize: 11, color: '#9898A4', marginTop: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15, color: '#18181B', paddingVertical: 0 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filter: { height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E9EC', justifyContent: 'center' },
  filterOn: { backgroundColor: '#18181B', borderColor: '#18181B' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#3B3B44' },
  filterTextOn: { color: '#FFFFFF' },
  count: { marginLeft: 'auto', fontSize: 13, color: '#6B6B76' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', padding: 14, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F1EFE8', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '800', color: '#5F5E5A' },
  name: { fontSize: 16, fontWeight: '700', color: '#18181B' },
  contact: { fontSize: 13, color: '#6B6B76', marginTop: 2 },
  call: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: '700' },
  trips: { marginLeft: 'auto', fontSize: 12, fontWeight: '600', color: '#3B3B44' },
});
