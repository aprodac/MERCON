/**
 * Customer links — every tracking link customers got on WhatsApp: one per trip,
 * and one per customer for their all-trucks page. Live / Ended / All, by type,
 * and a search (trip number, customer, plate, note). Each row says how often it
 * was opened and when it stops working; tapping opens the link's page, where it
 * can be changed, turned off or replaced.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, RefreshControl, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link2, Route, Search, Users, X } from 'lucide-react-native';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppTopBar } from '@/components/AppTopBar';
import { BG, Chips, EmptyState, INK, LINE, MUTED, SkeletonCard, p, tap } from '@/features/notifications/components/parts';
import { Chip } from '@/features/trips/details/components/parts';
import { TONE } from '@/features/trips/details/tripDetailsModel';
import { linksApi, type LinkKind, type LinkListStatus, type LinkRow } from '../linksApi';
import { STATUS_CHIP, lifeLine, linkSubtitle, linkTitle, opensLine } from '../linkModel';

const STATUSES: { value: LinkListStatus; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'ended', label: 'Ended' },
  { value: 'all', label: 'All' },
];
const KINDS: { value: LinkKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All links' },
  { value: 'trip', label: 'Trip links' },
  { value: 'customer', label: 'All-trucks pages' },
];

export default function LinksScreen() {
  const router = useRouter();
  // From a customer's page: only that customer's links.
  const params = useLocalSearchParams<{ customer?: string; name?: string }>();
  const [customer, setCustomer] = useState(params.customer ? { id: String(params.customer), name: String(params.name ?? 'this customer') } : null);
  const [status, setStatus] = useState<LinkListStatus>('live');
  const [kind, setKind] = useState<LinkKind | 'all'>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useInfiniteQuery({
    queryKey: ['tracking-links', status, kind, q, customer?.id ?? null],
    queryFn: ({ pageParam }) => linksApi.list({ status, kind, q, customer_id: customer?.id, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? last.links[last.links.length - 1]?.created_at : undefined),
  });
  const rows = list.data?.pages.flatMap((pg) => pg.links) ?? [];
  const counts = list.data?.pages[0]?.counts;
  const now = list.dataUpdatedAt;

  const open = (l: LinkRow) => {
    tap();
    router.push({ pathname: '/link-details', params: { kind: l.kind, id: l.id } });
  };

  const header = (
    <View style={{ gap: 14, paddingTop: 12, paddingBottom: 12 }}>
      <View style={s.pad}>
        <View style={[p.card, s.summary]}>
          <Stat icon={Route} value={counts?.live_trip} label="Live trip links" />
          <View style={s.vline} />
          <Stat icon={Users} value={counts?.live_customer} label="Live all-trucks pages" />
        </View>
      </View>
      <View style={s.pad}>
        <View style={s.search}>
          <Search size={17} color={MUTED} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Trip number, customer, plate, note"
            placeholderTextColor="#A1A1AA"
            style={s.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search">
              <X size={16} color={MUTED} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <Chips options={STATUSES} value={status} onChange={setStatus} />
      <Chips options={KINDS} value={kind} onChange={setKind} />
      {customer ? (
        <View style={s.pad}>
          <TouchableOpacity style={s.only} onPress={() => { tap(); setCustomer(null); }} accessibilityRole="button" accessibilityLabel="Show every customer">
            <Text style={s.onlyText} numberOfLines={1}>Only {customer.name}</Text>
            <X size={14} color={Colors.white} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <AppTopBar title="Customer links" />
      <FlatList
        data={rows}
        keyExtractor={(l) => `${l.kind}:${l.id}`}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => list.refetch()} tintColor={Colors.primary} />}
        renderItem={({ item, index }) => (
          <View style={s.pad}>
            <LinkRowView link={item} now={now} first={index === 0} last={index === rows.length - 1} onPress={() => open(item)} />
          </View>
        )}
        ListEmptyComponent={
          list.isLoading ? (
            <View style={s.pad}><SkeletonCard rows={4} /></View>
          ) : list.isError ? (
            <View style={s.pad}>
              <View style={[p.card, { padding: 14 }]}>
                <Text style={s.errorText}>{`Couldn't load the links: ${getApiErrorMessage(list.error)}`}</Text>
              </View>
            </View>
          ) : (
            <EmptyState
              icon={Link2}
              title={q ? 'Nothing matches' : status === 'live' ? 'No live links' : 'No links'}
              text={q ? 'Try a trip number, a customer name or a plate.' : 'A link is made the first time a trip or a customer page is shared on WhatsApp.'}
            />
          )
        }
        ListFooterComponent={
          list.hasNextPage ? (
            <View style={[s.pad, { marginTop: 12 }]}>
              <TouchableOpacity style={s.more} onPress={() => list.fetchNextPage()} disabled={list.isFetchingNextPage} activeOpacity={0.8}>
                {list.isFetchingNextPage ? <ActivityIndicator color={INK} /> : <Text style={s.moreText}>Show more</Text>}
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Route; value: number | undefined; label: string }) {
  return (
    <View style={s.stat}>
      <View style={s.statTop}>
        <Icon size={15} color={MUTED} />
        <Text style={s.statValue}>{value ?? '—'}</Text>
      </View>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function LinkRowView({ link, now, first, last, onPress }: { link: LinkRow; now: number; first: boolean; last: boolean; onPress: () => void }) {
  const chip = STATUS_CHIP[link.status];
  const tone = link.kind === 'trip' ? TONE.violet : TONE.sky;
  const Icon = link.kind === 'trip' ? Route : Users;
  return (
    <TouchableOpacity
      style={[s.row, first && s.rowFirst, last && s.rowLast, !first && p.rowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <View style={[s.icon, { backgroundColor: tone.bg }]}><Icon size={18} color={tone.fg} strokeWidth={2.2} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={s.rowTop}>
          <Text style={s.title} numberOfLines={1}>{linkTitle(link)}</Text>
          {link.expiring_soon ? <Chip label="Expiring soon" tone="amber" /> : link.status !== 'live' ? <Chip label={chip.label} tone={chip.tone} /> : null}
        </View>
        <Text style={s.sub} numberOfLines={1}>{linkSubtitle(link)}</Text>
        {link.label ? <Text style={s.note} numberOfLines={1}>{`“${link.label}”`}</Text> : null}
        <Text style={s.meta} numberOfLines={1}>
          <Text style={link.open_count ? s.metaStrong : undefined}>{opensLine(link, now)}</Text>
        </Text>
        <Text style={s.metaLife} numberOfLines={1}>{lifeLine(link, now)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  pad: { paddingHorizontal: 16 },
  summary: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  vline: { width: 1, alignSelf: 'stretch', backgroundColor: LINE },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { fontSize: 20, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, fontWeight: '600', color: MUTED },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: LINE, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 15, color: INK, paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, backgroundColor: Colors.white, borderLeftWidth: 1, borderRightWidth: 1, borderColor: LINE },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
  sub: { fontSize: 13, color: MUTED },
  note: { fontSize: 13, color: INK, fontStyle: 'italic' },
  meta: { fontSize: 12, color: MUTED, marginTop: 2 },
  metaStrong: { color: INK, fontWeight: '600' },
  metaLife: { fontSize: 12, color: MUTED },
  errorText: { fontSize: 14, color: '#D92D20' },
  only: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, backgroundColor: INK, borderRadius: 16, paddingHorizontal: 12, height: 32, maxWidth: '100%' },
  onlyText: { color: Colors.white, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  more: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 14, fontWeight: '600', color: INK },
});
