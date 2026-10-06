/**
 * Route: /customer-details?id=… — one customer, laid out like the driver page:
 * one header card (logo, name, status, then a row per contact with WhatsApp
 * and call), then tabs — Trips · Sharing · Invoices · Quotes · Places — each
 * a single list. Sharing is the web's live-tracking links.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Linking, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { setStringAsync } from '../../../lib/clipboard';
import {
  ArrowLeft, ChevronRight, Copy, ExternalLink, MapPin, MessageCircle, Phone, ReceiptText, Share2, SquarePen, Tag, Users,
} from 'lucide-react-native';
import { EmptyHint, PageTitle, SectionLabel, TabIcon, Tile } from '@/components/pageCues';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { operatorService } from '../../../lib/operator';
import { statusChip } from '../../trips/details/tripDetailsModel';
import { Card, Chip, INK, MUTED, PAGE, tap } from '../../trips/details/components/parts';
import { fmtDay, fmtSar, niceName } from '../../trips/create/components/ui';
import { daysOverdue, useCustomerDetail } from './useCustomerDetail';
import { customerDetailApi, type CustomerTrip } from './customerDetailApi';

type Tab = 'trips' | 'sharing' | 'invoices' | 'quotes' | 'places';

const LIVE = ['Loading', 'InTransit', 'Delayed'];
const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
};
const digits = (p?: string | null) => (p ?? '').replace(/[^0-9]/g, '');
/** 05XXXXXXXX → 9665XXXXXXXX for WhatsApp. */
const waNumber = (p?: string | null) => {
  const d = digits(p);
  if (d.startsWith('966')) return d;
  if (d.startsWith('0')) return `966${d.slice(1)}`;
  return d.length === 9 ? `966${d}` : d;
};
const call = (p?: string | null) => digits(p) && Linking.openURL(`tel:${digits(p)}`).catch(() => {});
const whatsapp = (p?: string | null) => digits(p) && Linking.openURL(`https://wa.me/${waNumber(p)}`).catch(() => {});

const routeOf = (t: CustomerTrip) => {
  const stops = [...(t.stops ?? [])].sort((a: any, b: any) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0));
  const out = stops.filter((s: any) => (s.leg_index ?? 0) === 0);
  return {
    from: niceName(out[0]?.location_name || out[0]?.location?.name) || 'Pickup',
    to: niceName(out[out.length - 1]?.location_name || out[out.length - 1]?.location?.name) || 'Drop-off',
    round: stops.some((s: any) => (s.leg_index ?? 0) === 1),
  };
};

export default function CustomerDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cid = String(id ?? '');
  const [now, setNow] = useState(() => Date.now());
  const c = useCustomerDetail(cid, now);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('trips');
  const [toast, setToast] = useState<string | null>(null);

  // Tracking links are asked for only once the Sharing tab is opened.
  const liveIds = c.trips.live.map((t) => t.id);
  const sharing = tab === 'sharing';
  const linkQ = useQuery({ queryKey: ['customers', 'detail', cid, 'tracking-link'], queryFn: () => customerDetailApi.trackingLink(cid), enabled: sharing && !!cid });
  const tripLinksQ = useQuery({ queryKey: ['customers', 'detail', cid, 'trip-links', liveIds], queryFn: () => operatorService.trackingLinks(liveIds), enabled: sharing && liveIds.length > 0 });

  const refresh = async () => {
    setRefreshing(true);
    setNow(Date.now());
    try {
      await Promise.all([c.refresh(), sharing ? linkQ.refetch() : null]);
    } finally {
      setRefreshing(false);
    }
  };

  const customer = c.customer;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customers'));

  const bar = (
    <View style={[s.bar, { paddingTop: insets.top + 4 }]}>
      <TouchableOpacity style={s.barBtn} onPress={back} accessibilityLabel="Back">
        <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
      </TouchableOpacity>
      <PageTitle title="Customer" />
      {customer ? (
        <TouchableOpacity style={s.barBtn} onPress={() => router.push({ pathname: '/customer-edit', params: { id: customer.id } })} accessibilityLabel="Edit customer">
          <SquarePen size={18} color={INK} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : <View style={{ width: 40 }} />}
    </View>
  );

  if (c.loading || !customer) {
    return (
      <View style={s.page}>
        {bar}
        <View style={s.pad16}>
          {c.loading ? (
            <View style={{ gap: 10 }}><SkeletonBlock height={190} radius={16} /><SkeletonBlock height={44} radius={12} /><SkeletonBlock height={220} radius={16} /></View>
          ) : (
            <EmptyState title={c.notFound ? 'Customer not found' : 'Couldn’t load this customer'} subtitle={c.notFound ? 'It may have been removed.' : 'Go back and try again.'} />
          )}
        </View>
      </View>
    );
  }

  const m = c.money;
  const cur = m?.currency ?? 'SAR';
  const logo = resolveMediaUrl(customer.logo_url);
  const name = niceName(customer.name);
  const openAllTrips = () => router.push({ pathname: '/trips', params: { customerId: customer.id, customerName: name } });
  const openTrip = (tripId: string) => router.push({ pathname: '/trip-details', params: { id: tripId } });

  const recent = customer.trips ?? [];
  const totalTrips = customer._count?.trips ?? recent.length;
  const live = c.trips.live.length ? c.trips.live : recent.filter((t) => LIVE.includes(t.status));

  const same = (a?: string | null, b?: string | null) => !!digits(a) && digits(a) === digits(b);
  const people = [
    { key: 'primary', name: niceName(customer.primary_contact_person) || 'Primary contact', phone: customer.primary_contact_phone },
    { key: 'secondary', name: niceName(customer.secondary_contact_person) || 'Secondary contact', phone: customer.secondary_contact_phone },
  ].filter((x) => x.phone || !x.name.endsWith(' contact'));
  // Company numbers are listed only when they aren't one of the people above.
  const listed = (n?: string | null) => people.some((x) => same(x.phone, n));
  const contacts = [
    ...people,
    ...(customer.contact_phone && !listed(customer.contact_phone) ? [{ key: 'main', name: 'Main phone', phone: customer.contact_phone }] : []),
    ...(customer.whatsapp_number && !listed(customer.whatsapp_number) && !same(customer.whatsapp_number, customer.contact_phone)
      ? [{ key: 'wa', name: 'WhatsApp number', phone: customer.whatsapp_number }] : []),
  ];
  const mainPhone = contacts.find((x) => x.phone)?.phone ?? null;
  const invoices = [...(c.statement?.invoices ?? [])].filter((i) => i.status !== 'Void')
    .sort((a, b) => new Date(b.invoice_date ?? 0).getTime() - new Date(a.invoice_date ?? 0).getTime());

  const waText = (text: string) => Linking.openURL(`https://wa.me/${waNumber(customer.whatsapp_number || mainPhone)}?text=${encodeURIComponent(text)}`).catch(() => {});
  const copy = async (url: string) => {
    setToast((await setStringAsync(url)) ? 'Link copied' : 'Couldn’t copy the link');
  };
  const sendAll = (url: string) => waText(`*${name} · live trucks*\nAll your trucks on the road, live: ${url}`);
  const sendTrip = (t: CustomerTrip, url: string) => {
    const r = routeOf(t);
    waText(`*${name} · ${t.ref_id || 'Trip'}*\n${r.from} → ${r.to}\nTrack live: ${url}`);
  };
  const opensLabel = (n: number, last: string | null | undefined) => (n > 0 ? `Opened ${n}×${last ? ` · last ${fmtDay(last.slice(0, 10))}` : ''}` : 'Not opened yet');
  const link = linkQ.data;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'trips', label: 'Trips' },
    { id: 'sharing', label: 'Sharing', badge: live.length || undefined },
    { id: 'invoices', label: 'Invoices', badge: m?.overdueCount || undefined },
    { id: 'quotes', label: 'Quotes' },
    { id: 'places', label: 'Places' },
  ];

  const tabBody = () => {
    if (tab === 'trips') {
      return (
        <>
          <Card style={s.listCard}>
            {recent.length === 0 ? <EmptyHint>No trips yet.</EmptyHint> : recent.slice(0, 15).map((t, i) => {
              const r = routeOf(t);
              const chip = statusChip(t.status);
              const d = t.planned_start ? new Date(t.planned_start) : null;
              return (
                <TouchableOpacity key={t.id} style={[s.line, i > 0 && s.lineBorder]} activeOpacity={0.6} onPress={() => openTrip(t.id)}>
                  <View style={s.date}>
                    <Text style={s.dateDay}>{d ? d.getDate() : '—'}</Text>
                    <Text style={s.dateMonth}>{d ? d.toLocaleDateString('en-GB', { month: 'short' }) : ''}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{r.from} → {r.to}{r.round ? ' ↺' : ''}</Text>
                    <Text style={s.sub} numberOfLines={1}>{[t.ref_id, t.driver ? niceName(`${t.driver.first_name} ${t.driver.last_name}`) : 'No driver yet'].filter(Boolean).join('  ·  ')}</Text>
                  </View>
                  <Chip label={chip.label} tone={chip.tone} />
                </TouchableOpacity>
              );
            })}
          </Card>
          {totalTrips > 15 ? (
            <TouchableOpacity style={s.wideBtn} activeOpacity={0.8} onPress={openAllTrips}>
              <Text style={s.wideBtnText}>See all {totalTrips} trips</Text>
            </TouchableOpacity>
          ) : null}
        </>
      );
    }

    if (tab === 'sharing') {
      if (linkQ.isLoading) return <Card><EmptyHint>Loading…</EmptyHint></Card>;
      if (linkQ.isError) return <Card><EmptyHint>Couldn’t load the tracking links. Pull down to try again.</EmptyHint></Card>;
      if (!link?.enabled || !link.url) return <Card><EmptyHint>Live tracking is switched off for this customer. Turn it on from the web to share links.</EmptyHint></Card>;
      return (
        <Card style={s.listCard}>
          {/* The one link that shows all of this customer's trucks */}
          <View style={[s.line, { paddingTop: 12 }]}>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text style={s.rowTitle}>All trucks</Text>
              <Text style={s.sub} numberOfLines={1}>{opensLabel(link.open_count, link.last_opened_at)}</Text>
            </View>
            <TouchableOpacity style={[s.round, s.roundSoft]} onPress={() => Linking.openURL(link.url!).catch(() => {})} accessibilityLabel="Open link">
              <ExternalLink size={16} color={INK} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.round, s.roundSoft]} onPress={() => copy(link.url!)} accessibilityLabel="Copy link">
              <Copy size={16} color={INK} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.round, { backgroundColor: Colors.primary }]} onPress={() => { tap(); sendAll(link.url!); }} accessibilityLabel="Send on WhatsApp">
              <Share2 size={16} color={Colors.white} strokeWidth={2.3} />
            </TouchableOpacity>
          </View>
          {/* Each truck on the road has its own link */}
          {live.map((t) => {
            const r = routeOf(t);
            const tl = tripLinksQ.data?.[t.id];
            return (
              <View key={t.id} style={[s.line, s.lineBorder]}>
                <TouchableOpacity style={{ flex: 1, minWidth: 0, gap: 1 }} activeOpacity={0.6} onPress={() => openTrip(t.id)}>
                  <Text style={s.rowTitle} numberOfLines={1}>{r.from} → {r.to}</Text>
                  <Text style={s.sub} numberOfLines={1}>{[t.ref_id, tripLinksQ.isLoading ? '…' : tl ? opensLabel(tl.open_count, tl.last_opened_at) : null].filter(Boolean).join('  ·  ')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.round, s.roundSoft, !tl?.url && s.off]} disabled={!tl?.url} onPress={() => tl?.url && copy(tl.url)} accessibilityLabel="Copy trip link">
                  <Copy size={16} color={INK} strokeWidth={2.2} />
                </TouchableOpacity>
                <TouchableOpacity style={[s.round, { backgroundColor: Colors.primary }, !tl?.url && s.off]} disabled={!tl?.url} onPress={() => { tap(); if (tl?.url) sendTrip(t, tl.url); }} accessibilityLabel="Send trip link on WhatsApp">
                  <Share2 size={16} color={Colors.white} strokeWidth={2.3} />
                </TouchableOpacity>
              </View>
            );
          })}
          {live.length === 0 ? <Text style={[s.sub, s.lineBorder, { paddingVertical: 12 }]}>No trucks on the road right now.</Text> : null}
        </Card>
      );
    }

    if (tab === 'invoices') {
      if (c.moneyFailed) return <Card><EmptyHint>Invoices aren’t available on this account.</EmptyHint></Card>;
      return (
        <Card style={s.listCard}>
          <View style={s.figures}>
            <Figure value={c.statement ? fmtSar(c.statement.total_invoiced) : '…'} label={`Invoiced (${cur})`} />
            <Figure value={c.statement ? fmtSar(c.statement.total_paid) : '…'} label="Paid" />
            <Figure value={c.statement ? fmtSar(c.statement.total_outstanding) : '…'} label="Outstanding" accent={!!m && m.outstanding > 0} />
          </View>
          {c.moneyLoading ? <EmptyHint>Loading…</EmptyHint>
            : invoices.length === 0 ? <EmptyHint>No invoices yet.</EmptyHint>
            : invoices.slice(0, 25).map((inv) => {
              const late = daysOverdue(inv, now);
              const isOpen = inv.balance_due > 0 && inv.status !== 'Draft';
              const overdue = isOpen && late !== null && late > 0;
              const state = inv.status === 'Draft' ? 'Draft' : !isOpen ? 'Paid' : overdue ? `${late} day${late === 1 ? '' : 's'} overdue` : late === null ? 'Open' : late === 0 ? 'Due today' : `Due in ${-late} day${late === -1 ? '' : 's'}`;
              return (
                <View key={inv.id} style={[s.line, s.lineBorder]}>
                  <Tile icon={ReceiptText} tone={overdue ? 'brand' : undefined} />
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{inv.ref_id || 'Invoice'}</Text>
                    <Text style={[s.sub, overdue && { color: Colors.primary, fontWeight: '600' }]} numberOfLines={1}>
                      {[inv.invoice_date ? fmtDay(inv.invoice_date.slice(0, 10)) : null, state].filter(Boolean).join('  ·  ')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 1 }}>
                    <Text style={s.amount}>{fmtSar(inv.total_amount)}</Text>
                    {isOpen ? <Text style={s.sub}>{fmtSar(inv.balance_due)} due</Text> : null}
                  </View>
                </View>
              );
            })}
        </Card>
      );
    }

    if (tab === 'quotes') {
      return (
        <Card style={s.listCard}>
          {c.quotationsLoading ? <EmptyHint>Loading…</EmptyHint>
            : c.quotations.length === 0 ? <EmptyHint>No active quotations.</EmptyHint>
            : c.quotations.slice(0, 40).map((q, i) => (
              <TouchableOpacity key={q.id} style={[s.line, i > 0 && s.lineBorder]} activeOpacity={0.6} onPress={() => router.push({ pathname: '/quotation-details', params: { id: q.id } })}>
                <Tile icon={Tag} />
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{niceName(q.name) || 'Quotation'}</Text>
                  <Text style={s.sub} numberOfLines={1}>{[q.vehicle_class || q.vehicle_type, q.line_type].filter(Boolean).join('  ·  ')}</Text>
                </View>
                <Text style={s.amount}>{fmtSar(Number(q.rate) || 0)}</Text>
                <ChevronRight size={16} color="#C4C4CC" />
              </TouchableOpacity>
            ))}
          {c.quotations.length > 40 ? <Text style={[s.sub, s.lineBorder, { paddingVertical: 12 }]}>Showing 40 of {c.quotations.length}. Open Quotations for the full list.</Text> : null}
        </Card>
      );
    }

    return (
      <Card style={s.listCard}>
        {c.placesLoading ? <EmptyHint>Loading…</EmptyHint>
          : c.places.length === 0 ? <EmptyHint>No saved places.</EmptyHint>
          : c.places.slice(0, 60).map((p, i) => (
            <TouchableOpacity
              key={p.id}
              style={[s.line, i > 0 && s.lineBorder]}
              disabled={p.lat == null || p.lng == null}
              activeOpacity={0.6}
              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`).catch(() => {})}
            >
              <Tile icon={MapPin} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{niceName(p.name)}</Text>
                {p.city || p.address ? <Text style={s.sub} numberOfLines={1}>{[p.city, p.address].filter(Boolean).join('  ·  ')}</Text> : null}
              </View>
              {p.lat != null && p.lng != null ? <ChevronRight size={16} color="#C4C4CC" /> : null}
            </TouchableOpacity>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
      >
        {/* Header card: who they are, then one row per way to reach them */}
        <View style={s.pad16}>
          <Card style={{ paddingVertical: 6 }}>
            <View style={[s.row, { paddingVertical: 10 }]}>
              {logo ? <Image source={{ uri: logo }} style={s.logo} resizeMode="contain" /> : (
                <View style={[s.logo, s.logoEmpty]}><Text style={s.logoText}>{initialsOf(customer.name)}</Text></View>
              )}
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Text style={s.name} numberOfLines={2}>{name}</Text>
                <View style={s.metaRow}>
                  <View style={s.pill}>
                    <View style={[s.dot, !customer.isActive && { backgroundColor: '#B4B4BC' }]} />
                    <Text style={[s.pillText, !customer.isActive && { color: MUTED }]}>{customer.isActive ? 'Active' : 'Inactive'}</Text>
                  </View>
                  <Text style={[s.sub, { flexShrink: 1 }]} numberOfLines={1}>{[`${totalTrips} trip${totalTrips === 1 ? '' : 's'}`, customer.payment_terms || null].filter(Boolean).join('  ·  ')}</Text>
                </View>
              </View>
            </View>

            {contacts.map((p) => (
              <View key={p.key} style={[s.line, s.lineBorder]}>
                <Tile icon={Phone} />
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text style={s.rowLabel} numberOfLines={1}>{p.name}</Text>
                  <Text style={s.rowTitle} numberOfLines={1} selectable>{p.phone || 'No phone number'}</Text>
                </View>
                {p.phone ? (
                  <>
                    <TouchableOpacity style={[s.round, s.roundSoft]} onPress={() => { tap(); whatsapp(p.phone); }} accessibilityLabel={`WhatsApp ${p.name}`}>
                      <MessageCircle size={18} color={INK} strokeWidth={2.2} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.round, { backgroundColor: Colors.charcoal }]} onPress={() => { tap(); call(p.phone); }} accessibilityLabel={`Call ${p.name}`}>
                      <Phone size={17} color={Colors.white} strokeWidth={2.3} />
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            ))}
            {customer.whatsapp_group_link ? (
              <TouchableOpacity style={[s.line, s.lineBorder]} onPress={() => Linking.openURL(customer.whatsapp_group_link!).catch(() => {})} activeOpacity={0.6}>
                <Tile icon={Users} />
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text style={s.rowLabel}>WhatsApp group</Text>
                  <Text style={s.rowTitle} numberOfLines={1}>{customer.whatsapp_group_name || 'Open group'}</Text>
                </View>
                <ChevronRight size={18} color="#A1A1AA" />
              </TouchableOpacity>
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
      <Toast visible={Boolean(toast)} message={toast ?? ''} type="success" onDismiss={() => setToast(null)} />
    </View>
  );
}

function Figure({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text style={[s.figureValue, accent && { color: Colors.primary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      <Text style={s.figureLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E9EC' },
  barTitle: { fontSize: 16, fontWeight: '700', color: INK },
  pad16: { paddingHorizontal: 16 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 68, height: 68, borderRadius: 18, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#ECECEF' },
  logoEmpty: { backgroundColor: Colors.primaryLight, borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  name: { fontSize: 20, fontWeight: '800', color: INK, letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F1F1F3' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: INK },
  pillText: { fontSize: 12, fontWeight: '700', color: INK },
  sub: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  iconTile: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
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
  empty: { fontSize: 14, color: MUTED },
  listCard: { paddingVertical: 4 },
  listEmpty: { paddingVertical: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  lineBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  amount: { fontSize: 15, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  date: { width: 40, height: 44, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 16, fontWeight: '700', color: INK, lineHeight: 18 },
  dateMonth: { fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase' },
  figures: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  figureValue: { fontSize: 19, fontWeight: '700', color: INK, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  figureLabel: { fontSize: 12, color: MUTED },
  wideBtn: { height: 46, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#E9E9EC', alignItems: 'center', justifyContent: 'center' },
  wideBtnText: { fontSize: 14, fontWeight: '700', color: INK },
});
