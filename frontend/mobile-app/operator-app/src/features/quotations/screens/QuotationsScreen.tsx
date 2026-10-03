/**
 * Operator Commercial Quotations — rate and lane lookup.
 * Companies first (like the web's customer picker): each with how many
 * quotations it has. Tap a company for its quotations, sorted by origin;
 * tap a quotation for its page; + adds one.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Search, Tag, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { niceName } from '@/features/trips/create/components/ui';
import { QuotationRow, QuotationsHeader } from '../components';
import { useQuotations } from '../hooks';
import { sortQuotations } from '../services/quotationsService';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
};

export default function QuotationsScreen() {
  const router = useRouter();
  const { quotations, loading, error, refresh, isRefreshing } = useQuotations();
  const [query, setQuery] = useState('');
  /** The company whose quotations are open; null = the list of companies. */
  const [customerId, setCustomerId] = useState<string | null>(null);

  // One entry per company, like the web's customer picker: most quotations first.
  const companies = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; active: number }>();
    for (const q of quotations) {
      const c = map.get(q.customerId) ?? { id: q.customerId, name: q.customerName, total: 0, active: 0 };
      c.total += 1;
      if (q.validityStatus === 'Active') c.active += 1;
      map.set(q.customerId, c);
    }
    return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [quotations]);
  const company = companies.find((c) => c.id === customerId) ?? null;

  const needle = query.trim().toLowerCase();
  const shownCompanies = useMemo(
    () => (needle ? companies.filter((c) => c.name.toLowerCase().includes(needle)) : companies),
    [companies, needle],
  );
  const shown = useMemo(() => {
    const list = quotations.filter((q) => {
      if (customerId && q.customerId !== customerId) return false;
      if (!needle) return true;
      return `${q.firstStop} ${q.lastStop} ${q.customerName} ${q.name} ${q.vehicleClass} ${q.quotationNumber ?? ''}`.toLowerCase().includes(needle);
    });
    return sortQuotations(list, 'route');
  }, [quotations, needle, customerId]);

  const first = loading && quotations.length === 0;
  const pick = (id: string | null) => { Haptics.selectionAsync().catch(() => {}); setCustomerId(id); setQuery(''); };

  const search = (
    <View style={s.search}>
      <Search size={17} color={MUTED} />
      <TextInput
        style={s.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder={company ? 'Search route or truck type' : 'Search company'}
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
  );

  return (
    <SafeAreaView style={s.page} edges={['top']}>
      <QuotationsHeader onAddPress={() => router.push('/quotation-edit')} />

      {error && quotations.length === 0 ? (
        <ErrorState message={error} onRetry={() => refresh()} className="flex-1" />
      ) : company ? (
        /* One company's quotations */
        <FlatList
          key="quotations"
          data={shown}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 12 }}>
              <View style={s.picked}>
                <TouchableOpacity style={s.backBtn} onPress={() => pick(null)} accessibilityLabel="All companies" hitSlop={8}>
                  <ArrowLeft size={18} color={INK} strokeWidth={2.4} />
                </TouchableOpacity>
                <View style={s.logo}><Text style={s.logoText}>{initialsOf(company.name)}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.name} numberOfLines={1}>{niceName(company.name)}</Text>
                  <Text style={s.sub}>{company.total} {company.total === 1 ? 'quotation' : 'quotations'}  ·  {company.active} active</Text>
                </View>
              </View>
              {search}
            </View>
          }
          renderItem={({ item }) => (
            <QuotationRow quotation={item} onPress={() => router.push({ pathname: '/quotation-details', params: { id: item.id } })} />
          )}
          ListEmptyComponent={<EmptyState title="No quotations match" subtitle="Try another search." Icon={Tag} className="mt-8" />}
        />
      ) : (
        /* The companies */
        <FlatList
          key="companies"
          data={first ? [] : shownCompanies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 12 }}>
              {search}
              {!first ? <Text style={s.count}>{shownCompanies.length} {shownCompanies.length === 1 ? 'company' : 'companies'}  ·  {quotations.length} quotations</Text> : null}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.company} activeOpacity={0.8} onPress={() => pick(item.id)} accessibilityRole="button" accessibilityLabel={`Open quotations for ${item.name}`}>
              <View style={s.logo}><Text style={s.logoText}>{initialsOf(item.name)}</Text></View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={s.name} numberOfLines={1}>{niceName(item.name)}</Text>
                <Text style={s.sub}>{item.active} active{item.total - item.active > 0 ? `  ·  ${item.total - item.active} not active` : ''}</Text>
              </View>
              <View style={s.badge}><Text style={s.badgeText}>{item.total}</Text></View>
              <ChevronRight size={18} color="#A1A1AA" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            first ? (
              <View style={{ gap: 8 }}>
                {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={72} radius={16} />)}
              </View>
            ) : query ? (
              <EmptyState title="No company matches" subtitle="Try another name." Icon={Tag} className="mt-8" />
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
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15, color: INK, paddingVertical: 0 },
  count: { fontSize: 14, fontWeight: '600', color: MUTED },
  company: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 12, paddingHorizontal: 14 },
  logo: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  name: { fontSize: 16, fontWeight: '700', color: INK },
  sub: { fontSize: 13, color: MUTED },
  badge: { minWidth: 30, height: 26, borderRadius: 13, paddingHorizontal: 8, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', padding: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
});
