/**
 * Route: /third-party-details?id= — one subcontracted carrier
 * (GET /third-party-providers/:id and /:id/rates), laid out exactly like the
 * customer page: one header card (initials, name, status, then a row per way
 * to reach them), then tabs — Trips · Rates · Details — each a single list.
 * Rates are read-only here; they are edited on the web.
 * Each fact appears once; empty fields are left out instead of shown as "Not set".
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ArrowUpRight, CalendarDays, FileText, IdCard, Mail, MapPin, MessageCircle, Phone, SquarePen, Tag, UserRound, Wallet, type LucideIcon } from 'lucide-react-native';
import { EmptyHint, PageTitle, TabIcon, Tile } from '@/components/pageCues';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { EmptyState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { operatorService, type OperatorProviderRate, type OperatorThirdPartyProvider } from '@/lib/operator';
import { fmtSar, initialsOf, niceName } from '@/features/trips/create/components/ui';
import { routeOf } from '@/features/trips/list/tripListModel';
import { statusChip } from '@/features/trips/details/tripDetailsModel';
import { Card, Chip, INK, MUTED, PAGE, tap } from '@/features/trips/details/components/parts';

type Tab = 'trips' | 'rates' | 'details';

const digits = (v?: string | null) => (v ?? '').replace(/[^0-9]/g, '');

export default function ThirdPartyDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [provider, setProvider] = useState<OperatorThirdPartyProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // null = the rates could not be loaded (the rest of the page still shows).
  const [rates, setRates] = useState<OperatorProviderRate[] | null>([]);
  const [tab, setTab] = useState<Tab>('trips');

  const load = useCallback(async (pull?: boolean) => {
    if (!id) return;
    if (pull) setRefreshing(true);
    try {
      const [next, nextRates] = await Promise.all([
        operatorService.thirdPartyProviderById(id),
        operatorService.thirdPartyProviderRates(id).catch(() => null),
      ]);
      setProvider(next);
      setRates(nextRates);
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  // Reloads when coming back from Edit.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const p = provider;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/third-party'));

  const bar = (
    <View style={[s.bar, { paddingTop: insets.top + 4 }]}>
      <TouchableOpacity style={s.barBtn} onPress={back} accessibilityLabel="Back">
        <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
      </TouchableOpacity>
      <PageTitle title="Carrier" />
      {p ? (
        <TouchableOpacity style={s.barBtn} onPress={() => router.push({ pathname: '/third-party-edit', params: { id: p.id } })} accessibilityLabel="Edit carrier">
          <SquarePen size={18} color={INK} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : <View style={{ width: 40 }} />}
    </View>
  );

  if (!p) {
    return (
      <View style={s.page}>
        {bar}
        <View style={s.pad16}>
          {error ? (
            <EmptyState title="Couldn’t load this carrier" subtitle={error} />
          ) : (
            <View style={{ gap: 10 }}><SkeletonBlock height={190} radius={16} /><SkeletonBlock height={58} radius={12} /><SkeletonBlock height={120} radius={16} /></View>
          )}
        </View>
      </View>
    );
  }

  const active = p.isActive ?? true;
  const trips = p.trips ?? [];
  const totalTrips = p.total_trips ?? trips.length;
  const running = p.active_trips ?? 0;
  const paid = Number(p.total_cost) || 0;
  const phone = digits(p.phone);

  // What's on file — only the fields that have a value.
  const onFile = ([
    { icon: Wallet, label: 'Paid to this carrier', value: paid > 0 ? `SAR ${fmtSar(paid)}` : null },
    { icon: MapPin, label: 'Address', value: p.address },
    { icon: IdCard, label: 'VAT / tax no.', value: p.tax_id },
    { icon: FileText, label: 'Notes', value: p.notes },
    { icon: CalendarDays, label: 'Added', value: fullDate(p.createdAt) },
  ] as { icon: LucideIcon; label: string; value?: string | null }[]).filter((r) => !!r.value);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'trips', label: 'Trips', badge: running || undefined },
    { id: 'rates', label: 'Rates' },
    { id: 'details', label: 'Details' },
  ];

  const tabBody = () => {
    if (tab === 'trips') {
      return (
        <>
          <Card style={s.listCard}>
            {trips.length === 0 ? <EmptyHint>No trips yet.</EmptyHint> : trips.map((t, i) => {
              const chip = statusChip(t.status);
              const d = new Date(t.planned_start || t.createdAt || '');
              const dated = !Number.isNaN(d.getTime());
              const route = routeOf(t);
              const hasRoute = route.from !== '—' || route.to !== '—';
              const customer = niceName(t.customer?.name) || 'No customer';
              const cost = Number(t.third_party_cost);
              return (
                <TouchableOpacity key={t.id} style={[s.line, i > 0 && s.lineBorder]} activeOpacity={0.6} onPress={() => router.push({ pathname: '/trip-details', params: { id: t.id } })}>
                  <View style={s.date}>
                    <Text style={s.dateDay}>{dated ? d.getDate() : '—'}</Text>
                    <Text style={s.dateMonth}>{dated ? d.toLocaleDateString(undefined, { month: 'short' }) : ''}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{hasRoute ? `${route.from} → ${route.to}` : customer}</Text>
                    <Text style={s.sub} numberOfLines={1}>
                      {[t.ref_id ?? t.id.slice(0, 8), hasRoute ? customer : null, cost > 0 ? `SAR ${fmtSar(cost)}` : null].filter(Boolean).join('  ·  ')}
                    </Text>
                  </View>
                  <Chip label={chip.label} tone={chip.tone} />
                </TouchableOpacity>
              );
            })}
          </Card>
          {totalTrips > trips.length && trips.length > 0 ? <Text style={[s.sub, { textAlign: 'center' }]}>The latest {trips.length} of {totalTrips} trips.</Text> : null}
        </>
      );
    }

    if (tab === 'rates') {
      return (
        <Card style={s.listCard}>
          {rates === null ? <EmptyHint>Couldn’t load the rates. Pull down to try again.</EmptyHint>
            : rates.length === 0 ? <EmptyHint icon={Tag}>No rates yet.</EmptyHint>
            : rates.map((r, i) => {
              const live = r.status === 'active';
              return (
                <View key={r.id} style={[s.line, i > 0 && s.lineBorder, !live && s.off]}>
                  <Tile icon={Tag} />
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{niceName(r.originLocation?.name || r.origin_city)} → {niceName(r.destinationLocation?.name || r.destination_city)}</Text>
                    <Text style={s.sub} numberOfLines={1}>{[r.vehicle_class, r.line_type, live ? r.pricing_basis : niceName(r.status)].filter(Boolean).join('  ·  ')}</Text>
                  </View>
                  <Text style={s.amount}>{fmtSar(Number(r.cost) || 0)}</Text>
                </View>
              );
            })}
        </Card>
      );
    }

    return (
      <Card style={s.listCard}>
        {onFile.length === 0 ? <EmptyHint icon={FileText}>Nothing else on file.</EmptyHint> : onFile.map((r, i) => (
          <View key={r.label} style={[s.line, i > 0 && s.lineBorder]}>
            <Tile icon={r.icon} />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text style={s.rowLabel} numberOfLines={1}>{r.label}</Text>
              <Text style={s.rowTitle} selectable>{r.value}</Text>
            </View>
          </View>
        ))}
      </Card>
    );
  };

  return (
    <View style={s.page}>
      {bar}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
      >
        {/* Header card: who they are, then one row per way to reach them */}
        <View style={s.pad16}>
          <Card style={{ paddingVertical: 6 }}>
            <View style={[s.row, { paddingVertical: 10 }]}>
              <View style={[s.logo, s.logoEmpty]}><Text style={s.logoText}>{initialsOf(p.name)}</Text></View>
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <Text style={s.name} numberOfLines={2}>{niceName(p.name)}</Text>
                {p.contact_person ? (
                  <View style={s.person}>
                    <UserRound size={14} color={MUTED} strokeWidth={2.2} />
                    <Text style={[s.sub, { flexShrink: 1 }]} numberOfLines={1}>{niceName(p.contact_person)}</Text>
                  </View>
                ) : null}
                <View style={s.metaRow}>
                  <View style={s.pill}>
                    <View style={[s.dot, !active && { backgroundColor: '#B4B4BC' }]} />
                    <Text style={[s.pillText, !active && { color: MUTED }]}>{active ? 'Active' : 'Inactive'}</Text>
                  </View>
                  <Text style={[s.sub, { flexShrink: 1 }]} numberOfLines={1}>
                    {totalTrips === 0 ? 'No trips yet' : [`${totalTrips} trip${totalTrips === 1 ? '' : 's'}`, running > 0 ? `${running} running` : null].filter(Boolean).join('  ·  ')}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[s.line, s.lineBorder]}>
              <Tile icon={Phone} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text style={s.rowLabel}>Phone</Text>
                <Text style={s.rowTitle} numberOfLines={1} selectable>{p.phone || 'No phone number'}</Text>
              </View>
              {phone ? (
                <>
                  <TouchableOpacity style={[s.round, s.roundSoft]} onPress={() => { tap(); Linking.openURL(`https://wa.me/${phone}`).catch(() => {}); }} accessibilityLabel="WhatsApp carrier">
                    <MessageCircle size={18} color={INK} strokeWidth={2.2} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.round, { backgroundColor: Colors.charcoal }]} onPress={() => { tap(); Linking.openURL(`tel:${p.phone}`).catch(() => {}); }} accessibilityLabel="Call carrier">
                    <Phone size={17} color={Colors.white} strokeWidth={2.3} />
                  </TouchableOpacity>
                </>
              ) : null}
            </View>

            {p.email ? (
              <View style={[s.line, s.lineBorder]}>
                <Tile icon={Mail} />
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text style={s.rowLabel}>Email</Text>
                  <Text style={s.rowTitle} numberOfLines={1} selectable>{p.email}</Text>
                </View>
                <TouchableOpacity style={[s.round, s.roundSoft]} onPress={() => { tap(); Linking.openURL(`mailto:${p.email}`).catch(() => {}); }} accessibilityLabel="Email carrier">
                  <ArrowUpRight size={18} color={INK} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>
            ) : null}
          </Card>
        </View>

        {/* Tabs */}
        <View style={s.tabsWrap}>
          <View style={s.tabs}>
            {tabs.map((t) => {
              const on = t.id === tab;
              return (
                <TouchableOpacity key={t.id} style={[s.tab, on && s.tabOn]} onPress={() => { if (!on) tap(); setTab(t.id); }} activeOpacity={0.8} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  <TabIcon label={t.label} on={on} />
                  <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>{t.label}</Text>
                  {t.badge ? <View style={s.badge}><Text style={s.badgeText}>{t.badge}</Text></View> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={s.body}>{tabBody()}</View>
      </ScrollView>
    </View>
  );
}

/** "3 Oct 2026" */
function fullDate(iso?: string | null): string | null {
  const d = new Date(iso ?? '');
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Same sizes, fonts and spacing as the customer page (customers/details/CustomerDetailsScreen).
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E9EC' },
  pad16: { paddingHorizontal: 16 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 68, height: 68, borderRadius: 18, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#ECECEF' },
  logoEmpty: { backgroundColor: Colors.primaryLight, borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  name: { fontSize: 20, fontWeight: '800', color: INK, letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F1F1F3' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: INK },
  pillText: { fontSize: 12, fontWeight: '700', color: INK },
  sub: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  rowLabel: { fontSize: 12, color: MUTED },
  rowTitle: { fontSize: 15, fontWeight: '600', color: INK },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  roundSoft: { backgroundColor: '#F1F1F3' },
  off: { opacity: 0.4 },

  tabsWrap: { paddingHorizontal: 16, paddingVertical: 12 },
  tabs: { flexDirection: 'row', gap: 2, backgroundColor: '#EAEAED', borderRadius: 12, padding: 3 },
  tab: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: 52, borderRadius: 9, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 1 },
  tabOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 12.5, fontWeight: '600', color: MUTED },
  tabTextOn: { color: INK, fontWeight: '700' },
  badge: { position: 'absolute', top: 4, right: 6, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800', color: Colors.white },

  body: { paddingHorizontal: 16, gap: 10 },
  listCard: { paddingVertical: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  lineBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  amount: { fontSize: 15, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  date: { width: 40, height: 44, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 16, fontWeight: '700', color: INK, lineHeight: 18 },
  dateMonth: { fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase' },
});
