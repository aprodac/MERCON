/**
 * 3rd party fleet — the subcontracted carriers (3PL) trips can be handed to.
 * Three tiles (All · Active · Inactive) that also filter, search, then one
 * compact row per carrier; tap a row for its details, + adds a carrier.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, TextInput, StyleSheet, StatusBar, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Building2, ChevronRight, Phone, Plus, Search, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { useOperatorThirdPartyProviders, type OperatorThirdPartyProvider } from '@/lib/operator';
import { AppTopBar } from '@/components/AppTopBar';
import { initialsOf, niceName } from '@/features/trips/create/components/ui';
import { compactSar } from '../format';

type Filter = 'all' | 'active' | 'inactive';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

export default function ThirdPartyScreen() {
  const router = useRouter();
  const { providers, loading, error, refetch } = useOperatorThirdPartyProviders();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Coming back from Add / Edit shows the change straight away.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const isActive = (p: OperatorThirdPartyProvider) => p.isActive ?? true;
  const counts = useMemo(() => {
    const active = providers.filter(isActive).length;
    return { all: providers.length, active, inactive: providers.length - active };
  }, [providers]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers.filter((p) => {
      if (filter === 'active' && !isActive(p)) return false;
      if (filter === 'inactive' && isActive(p)) return false;
      if (!q) return true;
      return `${p.name} ${p.contact_person ?? ''} ${p.phone ?? ''}`.toLowerCase().includes(q);
    });
  }, [providers, query, filter]);

  const first = loading && providers.length === 0;
  const tiles: { id: Filter; label: string; dot?: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active', dot: '#1F9D55' },
    { id: 'inactive', label: 'Inactive', dot: '#9898A4' },
  ];

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
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading && providers.length > 0} onRefresh={refetch} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <View style={{ gap: 14, marginBottom: 14 }}>
              <View style={s.tiles}>
                {tiles.map((t) => {
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
                  placeholder="Search carrier, contact or phone"
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

              {!first ? <Text style={s.count}>{shown.length} {shown.length === 1 ? 'carrier' : 'carriers'}</Text> : null}
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <ProviderRow provider={item} onPress={() => router.push({ pathname: '/third-party-details', params: { id: item.id } })} />
          )}
          ListEmptyComponent={
            first ? (
              <View style={{ gap: 8 }}>
                {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={78} radius={16} />)}
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

/**
 *   (AB)  Carrier name                                  (call)
 *         ● Active · Contact person
 *         12 trips · SAR 48.3K paid · 2 running now
 */
function ProviderRow({ provider: p, onPress }: { provider: OperatorThirdPartyProvider; onPress: () => void }) {
  const active = p.isActive ?? true;
  const trips = p.total_trips ?? p._count?.subcontracts ?? 0;
  const running = p.active_trips ?? 0;
  const cost = Number(p.total_cost) || 0;
  const work = [
    `${trips} ${trips === 1 ? 'trip' : 'trips'}`,
    cost > 0 ? `SAR ${compactSar(cost)} paid` : null,
  ].filter(Boolean).join('  ·  ');

  return (
    <TouchableOpacity style={s.row} activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${p.name}`}>
      <View style={s.avatar}><Text style={s.avatarText}>{initialsOf(p.name)}</Text></View>
      <View style={s.rowText}>
        <Text style={s.name} numberOfLines={2}>{niceName(p.name)}</Text>
        <View style={s.metaRow}>
          <View style={[s.dot, { backgroundColor: active ? '#1F9D55' : '#9898A4' }]} />
          <Text style={s.meta} numberOfLines={1}>
            <Text style={{ color: active ? '#146C3C' : MUTED, fontWeight: '600' }}>{active ? 'Active' : 'Inactive'}</Text>
            {p.contact_person ? `  ·  ${niceName(p.contact_person)}` : ''}
          </Text>
        </View>
        <Text style={s.meta} numberOfLines={1}>
          {work}
          {running > 0 ? <Text style={{ color: '#2449A8', fontWeight: '600' }}>{`  ·  ${running} running`}</Text> : null}
        </Text>
      </View>
      {p.phone ? (
        <TouchableOpacity style={s.call} onPress={() => Linking.openURL(`tel:${p.phone}`).catch(() => {})} hitSlop={8} accessibilityLabel={`Call ${p.name}`}>
          <Phone size={17} color={INK} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : <ChevronRight size={18} color="#B4B4BD" />}
    </TouchableOpacity>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 12, paddingHorizontal: 14 },
  avatar: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#F1EFE8', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#5F5E5A' },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 16, fontWeight: '600', color: INK, letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 13, color: MUTED, flexShrink: 1, fontVariant: ['tabular-nums'] },
  call: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
});
