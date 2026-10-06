/**
 * Operator Commercial Quotations — rate and lane lookup.
 *
 * Companies first (logo, Monthly / Extra split, truck sizes, price range,
 * expiring and missing-pay warnings). Searching there also finds routes across
 * every company. Tap a company for its quotations: as a list grouped by
 * starting city, or "By route" — one card per route with a price per truck
 * size. Status pills, a Filters sheet (operation, line type, truck, rate
 * basis, sort) and removable filter chips work on both levels. + adds one.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, SectionList, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, CircleAlert, Clock, LayoutList, Rows3, SlidersHorizontal, Tag, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { formatQuotationRef, lineTypeLabel } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { FilterChips } from '@/components/FilterChips';
import { ListSearch, listPage } from '@/components/ListSearch';
import { niceName } from '@/features/trips/create/components/ui';
import {
  CompanyLogo, OPERATION_TONE, QuotationFilterSheet, QuotationRow, QuotationsHeader, RoutePriceCard, SORT_OPTIONS,
  groupByRoute, lineTypeIcon, truckOrder, type FilterOption,
} from '../components';
import { useQuotations } from '../hooks';
import { filterCount, matchesFilters, matchesStatus, routeText, sortQuotations } from '../services/quotationsService';
import { EMPTY_QUOTATION_FILTERS, type QuotationFilters, type QuotationListItem, type QuotationSortOption, type QuotationStatusFilter } from '../types';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

type View_ = 'list' | 'route';

interface CompanySummary {
  id: string;
  name: string;
  logo: string | null;
  total: number;
  active: number;
  monthly: number;
  extra: number;
  trucks: string[];
  /** Per-trip price range (or per-month when the company has only monthly rates). */
  min: number;
  max: number;
  perMonth: boolean;
  expiring: number;
  noPay: number;
}

function summarise(list: QuotationListItem[]): CompanySummary[] {
  const map = new Map<string, CompanySummary & { trip: number[]; month: number[] }>();
  for (const q of list) {
    const c = map.get(q.customerId) ?? {
      id: q.customerId, name: q.customerName, logo: q.customerLogo, total: 0, active: 0, monthly: 0, extra: 0,
      trucks: [], min: 0, max: 0, perMonth: false, expiring: 0, noPay: 0, trip: [], month: [],
    };
    c.total += 1;
    if (q.validityStatus === 'Active') c.active += 1;
    if (q.operationKey === 'Monthly') c.monthly += 1; else c.extra += 1;
    if (!c.trucks.includes(q.vehicleClass)) c.trucks.push(q.vehicleClass);
    if (q.expiringSoon) c.expiring += 1;
    if (q.driverPayout === null && q.validityStatus === 'Active') c.noPay += 1;
    (q.isMonthly ? c.month : c.trip).push(q.rate);
    c.logo = c.logo ?? q.customerLogo;
    map.set(q.customerId, c);
  }
  return [...map.values()].map(({ trip, month, ...c }) => {
    const prices = trip.length ? trip : month;
    return { ...c, trucks: c.trucks.sort((a, b) => truckOrder(a) - truckOrder(b)), min: Math.min(...prices), max: Math.max(...prices), perMonth: !trip.length };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

type CompanyListItem = { kind: 'company'; company: CompanySummary } | { kind: 'heading'; title: string } | { kind: 'quote'; q: QuotationListItem };

export default function QuotationsScreen() {
  const router = useRouter();
  const { quotations, loading, error, refresh, isRefreshing } = useQuotations();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<QuotationStatusFilter>('all');
  const [filters, setFilters] = useState<QuotationFilters>(EMPTY_QUOTATION_FILTERS);
  const [sort, setSort] = useState<QuotationSortOption>('route');
  const [view, setView] = useState<View_>('list');
  const [sheet, setSheet] = useState(false);
  /** The company whose quotations are open; null = the list of companies. */
  const [customerId, setCustomerId] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const first = loading && quotations.length === 0;
  const open = (id: string) => router.push({ pathname: '/quotation-details', params: { id } });
  const pick = (id: string | null) => { Haptics.selectionAsync().catch(() => {}); setCustomerId(id); setQuery(''); };

  /** The open company's quotations, or every one. */
  const scope = useMemo(() => (customerId ? quotations.filter((q) => q.customerId === customerId) : quotations), [quotations, customerId]);
  const companyAll = useMemo(() => (customerId ? summarise(scope)[0] ?? null : null), [scope, customerId]);

  // Inside a company the search narrows its routes; on the companies page it is handled below.
  const searched = useMemo(
    () => (customerId && needle ? scope.filter((q) => routeText(q).includes(needle) || (formatQuotationRef(q.quotationNumber) ?? '').toLowerCase().includes(needle)) : scope),
    [scope, customerId, needle],
  );
  const filtered = useMemo(() => searched.filter((q) => matchesStatus(q, status) && matchesFilters(q, filters)), [searched, status, filters]);
  const sorted = useMemo(() => sortQuotations(filtered, sort), [filtered, sort]);

  // Status pills count within the search and the sheet's filters.
  const counts = useMemo(() => {
    const base = searched.filter((q) => matchesFilters(q, filters));
    return {
      all: base.length,
      active: base.filter((q) => matchesStatus(q, 'active')).length,
      expiring: base.filter((q) => q.expiringSoon).length,
      inactive: base.filter((q) => matchesStatus(q, 'inactive')).length,
    };
  }, [searched, filters]);

  // The sheet's choices, with how many quotations each has (within the status pill).
  const sheetOptions = useMemo(() => {
    const base = searched.filter((q) => matchesStatus(q, status));
    const tally = (key: (q: QuotationListItem) => string) => {
      const m = new Map<string, number>();
      base.forEach((q) => m.set(key(q), (m.get(key(q)) ?? 0) + 1));
      return m;
    };
    const op = tally((q) => q.operationKey);
    const lt = tally((q) => q.lineTypeKey);
    const tr = tally((q) => q.vehicleClass);
    const ba = tally((q) => (q.isMonthly ? 'PER_MONTH' : 'PER_TRIP'));
    const keep = (picked: string[], m: Map<string, number>) => [...new Set([...m.keys(), ...picked])];
    return {
      operation: keep(filters.operation, op).sort().reverse().map((v) => ({ value: v, label: v, count: op.get(v) ?? 0 })),
      lineType: keep(filters.lineType, lt).sort().map((v) => ({ value: v, label: lineTypeLabel(v) || v, count: lt.get(v) ?? 0, Icon: lineTypeIcon(v) })),
      truck: keep(filters.truck, tr).sort((a, b) => truckOrder(a) - truckOrder(b) || a.localeCompare(b)).map((v) => ({ value: v, label: v, count: tr.get(v) ?? 0 })),
      basis: keep(filters.basis, ba).sort().reverse().map((v) => ({ value: v, label: v === 'PER_MONTH' ? 'Per month' : 'Per trip', count: ba.get(v) ?? 0 })),
    } satisfies Record<keyof QuotationFilters, FilterOption[]>;
  }, [searched, status, filters]);

  /* ── Companies page ── */
  const companies = useMemo(() => summarise(filtered), [filtered]);
  const companyItems = useMemo<CompanyListItem[]>(() => {
    if (customerId) return [];
    const byName = companies.filter((c) => !needle || c.name.toLowerCase().includes(needle));
    const items: CompanyListItem[] = byName.map((c) => ({ kind: 'company', company: c }));
    if (needle) {
      // A route search: every company's quotations that go through the place typed.
      const routes = sortQuotations(filtered.filter((q) => routeText(q).includes(needle)), sort);
      if (routes.length) {
        items.push({ kind: 'heading', title: `${routes.length} ${routes.length === 1 ? 'route' : 'routes'} matching “${query.trim()}”` });
        routes.slice(0, 60).forEach((q) => items.push({ kind: 'quote', q }));
      }
    }
    return items;
  }, [customerId, companies, filtered, needle, query, sort]);

  /* ── One company's page ── */
  const sections = useMemo(() => {
    if (!sorted.length) return [];
    if (sort !== 'route') return [{ title: '', data: sorted }];
    const map = new Map<string, QuotationListItem[]>();
    sorted.forEach((q) => {
      const city = niceName(q.firstStop);
      map.set(city, [...(map.get(city) ?? []), q]);
    });
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [sorted, sort]);
  const routeGroups = useMemo(() => groupByRoute(sorted), [sorted]);

  /* ── Header pieces ── */
  const nFilters = filterCount(filters);
  const chips = (
    <FilterChips<QuotationStatusFilter>
      value={status}
      onChange={setStatus}
      items={[
        { key: 'all', label: 'All', count: first ? '–' : counts.all },
        { key: 'active', label: 'Active', dot: '#1F9D55', count: first ? '–' : counts.active },
        ...(counts.expiring > 0 || status === 'expiring' ? [{ key: 'expiring' as const, label: 'Expiring soon', dot: '#F79009', count: counts.expiring }] : []),
        { key: 'inactive', label: 'Not active', dot: '#9898A4', count: first ? '–' : counts.inactive },
      ]}
    />
  );
  const removeFilter = (field: keyof QuotationFilters, value: string) => setFilters((f) => ({ ...f, [field]: f[field].filter((v) => v !== value) }));
  const labelOf = (field: keyof QuotationFilters, value: string) => sheetOptions[field].find((o) => o.value === value)?.label ?? value;
  const activeChips = (nFilters > 0 || sort !== 'route') ? (
    <View style={s.activeRow}>
      {(Object.keys(filters) as (keyof QuotationFilters)[]).flatMap((field) => filters[field].map((v) => (
        <TouchableOpacity key={`${field}:${v}`} style={s.activeChip} onPress={() => removeFilter(field, v)} accessibilityLabel={`Remove filter ${labelOf(field, v)}`}>
          <Text style={s.activeText}>{labelOf(field, v)}</Text>
          <X size={13} color={INK} strokeWidth={2.4} />
        </TouchableOpacity>
      )))}
      {sort !== 'route' ? (
        <TouchableOpacity style={[s.activeChip, s.sortChip]} onPress={() => setSort('route')} accessibilityLabel="Reset sort">
          <Text style={s.activeText}>{SORT_OPTIONS.find((o) => o.value === sort)?.label}</Text>
          <X size={13} color={INK} strokeWidth={2.4} />
        </TouchableOpacity>
      ) : null}
      {nFilters > 1 ? (
        <TouchableOpacity onPress={() => setFilters(EMPTY_QUOTATION_FILTERS)} hitSlop={6}>
          <Text style={s.clearAll}>Clear all</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ) : null;
  const searchRow = (
    <View style={s.searchRow}>
      <View style={{ flex: 1 }}>
        <ListSearch value={query} onChangeText={setQuery} placeholder={customerId ? 'Search route, place or truck' : 'Search company or place'} />
      </View>
      <TouchableOpacity style={[s.filterBtn, nFilters > 0 && s.filterBtnOn]} onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel={`Filters${nFilters ? `, ${nFilters} on` : ''}`}>
        <SlidersHorizontal size={18} color={nFilters > 0 ? Colors.white : INK} strokeWidth={2.3} />
        {nFilters > 0 ? <View style={s.filterBadge}><Text style={s.filterBadgeText}>{nFilters}</Text></View> : null}
      </TouchableOpacity>
    </View>
  );
  const sheetEl = (
    <QuotationFilterSheet
      visible={sheet}
      onClose={() => setSheet(false)}
      filters={filters}
      sort={sort}
      onApply={(f, so) => { setFilters(f); setSort(so); }}
      options={sheetOptions}
      countFor={(f) => searched.filter((q) => matchesStatus(q, status) && matchesFilters(q, f)).length}
    />
  );
  const refreshControl = <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />;

  if (error && quotations.length === 0) {
    return (
      <SafeAreaView style={listPage.page} edges={['top']}>
        <QuotationsHeader onAddPress={() => router.push('/quotation-edit')} />
        <ErrorState message={error} onRetry={() => refresh()} className="flex-1" />
      </SafeAreaView>
    );
  }

  /* ── One company ── */
  if (customerId) {
    const c = companyAll;
    const header = (
      <View style={listPage.header}>
        {chips}
        <View style={s.picked}>
          <TouchableOpacity style={s.backBtn} onPress={() => pick(null)} accessibilityLabel="All companies" hitSlop={8}>
            <ArrowLeft size={18} color={INK} strokeWidth={2.4} />
          </TouchableOpacity>
          <CompanyLogo name={c?.name ?? ''} uri={c?.logo ?? null} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name} numberOfLines={1}>{niceName(c?.name ?? '')}</Text>
            <Text style={s.sub} numberOfLines={1}>{c ? `${c.total} ${c.total === 1 ? 'quotation' : 'quotations'}  ·  ${c.active} active` : ''}</Text>
          </View>
          <TouchableOpacity style={s.backBtn} onPress={() => router.push({ pathname: '/customer-details', params: { id: customerId } })} accessibilityLabel="Open customer" hitSlop={8}>
            <ChevronRight size={18} color={INK} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
        {searchRow}
        {activeChips}
        <View style={s.countRow}>
          <Text style={listPage.count}>
            {view === 'route' ? `${routeGroups.length} ${routeGroups.length === 1 ? 'route' : 'routes'}  ·  ` : ''}{sorted.length} {sorted.length === 1 ? 'quotation' : 'quotations'}
          </Text>
          <View style={s.toggle}>
            {([['list', LayoutList, 'List'], ['route', Rows3, 'By route']] as const).map(([key, Icon, label]) => (
              <TouchableOpacity key={key} style={[s.toggleBtn, view === key && s.toggleOn]} onPress={() => { Haptics.selectionAsync().catch(() => {}); setView(key); }} accessibilityRole="button" accessibilityState={{ selected: view === key }}>
                <Icon size={14} color={view === key ? INK : MUTED} strokeWidth={2.3} />
                <Text style={[s.toggleText, view === key && { color: INK }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
    const empty = <EmptyState title="No quotations match" subtitle="Try another search or clear the filters." Icon={Tag} className="mt-8" />;

    return (
      <SafeAreaView style={listPage.page} edges={['top']}>
        <QuotationsHeader onAddPress={() => router.push('/quotation-edit')} />
        {view === 'route' ? (
          <FlatList
            key="routes"
            data={routeGroups}
            keyExtractor={(g) => g.key}
            contentContainerStyle={listPage.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            refreshControl={refreshControl}
            ListHeaderComponent={header}
            renderItem={({ item }) => <RoutePriceCard group={item} onOpen={open} />}
            ListEmptyComponent={empty}
          />
        ) : (
          <SectionList
            key="list"
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={listPage.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            refreshControl={refreshControl}
            ListHeaderComponent={header}
            renderSectionHeader={({ section }) => (section.title ? (
              <View style={s.section}>
                <Text style={s.sectionTitle}>From {section.title}</Text>
                <Text style={s.sectionCount}>{section.data.length}</Text>
              </View>
            ) : null)}
            renderItem={({ item }) => <QuotationRow quotation={item} hideCustomer onPress={() => open(item.id)} />}
            ListEmptyComponent={empty}
          />
        )}
        {sheetEl}
      </SafeAreaView>
    );
  }

  /* ── The companies ── */
  const nCompanies = companyItems.filter((i) => i.kind === 'company').length;
  return (
    <SafeAreaView style={listPage.page} edges={['top']}>
      <QuotationsHeader onAddPress={() => router.push('/quotation-edit')} />
      <FlatList
        key="companies"
        data={first ? [] : companyItems}
        keyExtractor={(item) => (item.kind === 'company' ? `c:${item.company.id}` : item.kind === 'quote' ? `q:${item.q.id}` : `h:${item.title}`)}
        contentContainerStyle={listPage.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={refreshControl}
        ListHeaderComponent={
          <View style={listPage.header}>
            {chips}
            {searchRow}
            {activeChips}
            {!first ? <Text style={listPage.count}>{nCompanies} {nCompanies === 1 ? 'company' : 'companies'}  ·  {filtered.length} quotations</Text> : null}
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'heading') return <Text style={s.heading}>{item.title}</Text>;
          if (item.kind === 'quote') return <QuotationRow quotation={item.q} onPress={() => open(item.q.id)} />;
          return <CompanyCard c={item.company} onPress={() => pick(item.company.id)} />;
        }}
        ListEmptyComponent={
          first ? (
            <View style={{ gap: 8 }}>
              {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={112} radius={16} />)}
            </View>
          ) : query || status !== 'all' || nFilters > 0 ? (
            <EmptyState title="Nothing matches" subtitle="Try another name or place, or clear the filters." Icon={Tag} className="mt-8" />
          ) : (
            <EmptyState title="No quotations yet" subtitle="Tap + to add the first rate." Icon={Tag} className="mt-8" />
          )
        }
      />
      {sheetEl}
    </SafeAreaView>
  );
}

function CompanyCard({ c, onPress }: { c: CompanySummary; onPress: () => void }) {
  const trucks = c.trucks.slice(0, 4);
  const range = c.min === c.max ? `SAR ${money(c.min)}` : `SAR ${money(c.min)} – ${money(c.max)}`;
  return (
    <TouchableOpacity style={s.company} activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open quotations for ${c.name}`}>
      <View style={s.companyTop}>
        <CompanyLogo name={c.name} uri={c.logo} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={s.name} numberOfLines={1}>{niceName(c.name)}</Text>
          <Text style={s.sub} numberOfLines={1}>
            {range} <Text style={{ color: '#9898A4' }}>{c.perMonth ? '/ month' : '/ trip'}</Text>
          </Text>
        </View>
        <View style={s.badge}><Text style={s.badgeText}>{c.total}</Text></View>
        <ChevronRight size={18} color="#A1A1AA" />
      </View>
      <View style={s.companyTags}>
        {c.monthly > 0 ? <Text style={[s.tag, { color: OPERATION_TONE.Monthly.fg, backgroundColor: OPERATION_TONE.Monthly.bg }]}>Monthly {c.monthly}</Text> : null}
        {c.extra > 0 ? <Text style={[s.tag, { color: OPERATION_TONE.Extra.fg, backgroundColor: OPERATION_TONE.Extra.bg }]}>Extra {c.extra}</Text> : null}
        {trucks.map((t) => <Text key={t} style={s.tag}>{t}</Text>)}
        {c.trucks.length > trucks.length ? <Text style={s.tag}>+{c.trucks.length - trucks.length}</Text> : null}
      </View>
      {c.expiring > 0 || c.noPay > 0 || c.total > c.active ? (
        <View style={s.companyFoot}>
          {c.expiring > 0 ? <Flag Icon={Clock} color="#B54708" text={`${c.expiring} expiring soon`} /> : null}
          {c.noPay > 0 ? <Flag Icon={CircleAlert} color="#B42318" text={`${c.noPay} without driver pay`} /> : null}
          {c.total > c.active ? <Text style={s.footMuted}>{c.total - c.active} not active</Text> : null}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function Flag({ Icon, color, text }: { Icon: typeof Clock; color: string; text: string }) {
  return (
    <View style={s.flag}>
      <Icon size={12} color={color} strokeWidth={2.4} />
      <Text style={[s.flagText, { color }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  company: { gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 12, paddingHorizontal: 14 },
  companyTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  companyTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  companyFoot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#F1F1F3', paddingTop: 8 },
  tag: { fontSize: 12, fontWeight: '600', color: '#52525B', backgroundColor: '#F1F1F3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flagText: { fontSize: 12, fontWeight: '600' },
  footMuted: { fontSize: 12, color: '#9898A4' },
  name: { fontSize: 16, fontWeight: '700', color: INK },
  sub: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  badge: { minWidth: 30, height: 26, borderRadius: 13, paddingHorizontal: 8, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', padding: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E9EC', alignItems: 'center', justifyContent: 'center' },
  filterBtnOn: { backgroundColor: Colors.charcoal, borderColor: Colors.charcoal },
  filterBadge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.white },
  activeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: -4 },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingLeft: 10, paddingRight: 8, borderRadius: 999, backgroundColor: '#ECECEF' },
  sortChip: { backgroundColor: '#E8F0FB' },
  activeText: { fontSize: 12, fontWeight: '600', color: INK },
  clearAll: { fontSize: 12, fontWeight: '700', color: Colors.primary, paddingHorizontal: 4 },

  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  toggle: { flexDirection: 'row', backgroundColor: '#EAEAED', borderRadius: 10, padding: 2 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  toggleOn: { backgroundColor: Colors.white },
  toggleText: { fontSize: 12, fontWeight: '600', color: MUTED },

  section: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F6F6F7', paddingTop: 10, paddingBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: INK, letterSpacing: 0.2 },
  sectionCount: { fontSize: 12, fontWeight: '700', color: MUTED, backgroundColor: '#ECECEF', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden' },
  heading: { fontSize: 13, fontWeight: '800', color: MUTED, letterSpacing: 0.2, marginTop: 8 },
});
