/**
 * Route: /customer-details?id=… — one customer.
 *
 * A black header (name, status, since / payment terms, then three equal
 * cells: outstanding, overdue, paid), then only what an operator acts on:
 * contacts (each with call and WhatsApp), open invoices, and open trips.
 * Each fact appears once.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, MessageCircle, Phone, SquarePen, Users } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { statusChip, TONE } from '../../trips/details/tripDetailsModel';
import { INK, MUTED, PAGE, WA_INK, WA_LIGHT } from '../../trips/details/components/parts';
import { fmtSar, niceName } from '../../trips/create/components/ui';
import { daysOverdue, useCustomerDetail } from './useCustomerDetail';
import type { CustomerTrip } from './customerDetailApi';

const BORDER = '#E9E9EC';
const ON_DARK_MUTED = '#A1A1AA';
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

const monthYear = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '');

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
  const { id } = useLocalSearchParams<{ id: string }>();
  const [now, setNow] = useState(() => Date.now());
  const c = useCustomerDetail(String(id ?? ''), now);
  const [refreshing, setRefreshing] = useState(false);
  const [allInvoices, setAllInvoices] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    setNow(Date.now());
    try {
      await c.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const customer = c.customer;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customers'));

  const bar = (
    <View style={s.bar}>
      <TouchableOpacity style={s.barBtn} onPress={back} accessibilityLabel="Back">
        <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
      </TouchableOpacity>
      <Text style={s.barTitle}>Customer</Text>
      {customer ? (
        <TouchableOpacity style={s.barBtn} onPress={() => router.push({ pathname: '/customer-edit', params: { id: customer.id } })} accessibilityLabel="Edit customer">
          <SquarePen size={18} color={INK} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : <View style={{ width: 44 }} />}
    </View>
  );

  if (c.loading || !customer) {
    return (
      <SafeAreaView style={s.page} edges={['top']}>
        {bar}
        <View style={s.scroll}>
          {c.loading ? (
            <View style={{ gap: 12 }}><SkeletonBlock height={170} radius={20} /><SkeletonBlock height={50} radius={15} /><SkeletonBlock height={140} radius={16} /></View>
          ) : (
            <EmptyState title={c.notFound ? 'Customer not found' : 'Couldn’t load this customer'} subtitle={c.notFound ? 'It may have been removed.' : 'Go back and try again.'} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const m = c.money;
  const invoices = m ? (allInvoices ? m.open : m.open.slice(0, 3)) : [];
  const same = (a?: string | null, b?: string | null) => !!digits(a) && digits(a) === digits(b);
  const people = [
    { key: 'primary', name: niceName(customer.primary_contact_person) || 'Primary contact', phone: customer.primary_contact_phone, role: 'Primary' },
    { key: 'secondary', name: niceName(customer.secondary_contact_person) || 'Secondary contact', phone: customer.secondary_contact_phone, role: 'Secondary' },
  ].filter((x) => x.phone || x.name !== `${x.role} contact`);
  // Company numbers are listed only when they aren't one of the people above.
  const listed = (n?: string | null) => people.some((x) => same(x.phone, n));
  const contacts = [
    ...people,
    ...(customer.contact_phone && !listed(customer.contact_phone) ? [{ key: 'main', name: 'Main phone', phone: customer.contact_phone, role: 'Company' }] : []),
    ...(customer.whatsapp_number && !listed(customer.whatsapp_number) && !same(customer.whatsapp_number, customer.contact_phone)
      ? [{ key: 'wa', name: 'WhatsApp number', phone: customer.whatsapp_number, role: 'Company' }] : []),
  ];
  const cur = m?.currency ?? 'SAR';
  const cells: { label: string; value: string; bad?: boolean }[] = [
    { label: 'Outstanding', value: m ? `${cur} ${fmtSar(m.outstanding)}` : '—' },
    { label: m?.overdueCount ? `Overdue · ${m.overdueCount}` : 'Overdue', value: m ? `${cur} ${fmtSar(m.overdue)}` : '—', bad: !!m && m.overdue > 0 },
    { label: 'Paid', value: m ? `${cur} ${fmtSar(m.paid)}` : '—' },
  ];
  return (
    <SafeAreaView style={s.page} edges={['top']}>
      {bar}
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}>
        {/* 0 · black header: who, and what they owe */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <Text style={s.name} numberOfLines={2}>{niceName(customer.name)}</Text>
            <View style={s.status}>
              <View style={[s.statusDot, { backgroundColor: customer.isActive ? '#1F9D55' : '#9898A4' }]} />
              <Text style={[s.statusText, { color: customer.isActive ? '#146C3C' : MUTED }]}>{customer.isActive ? 'Active' : 'Suspended'}</Text>
            </View>
          </View>
          <Text style={s.since}>
            {[`Customer since ${monthYear(customer.createdAt)}`, customer.payment_terms, customer.driver_workflow === 'EXTERNAL_APP' ? 'Own driver app' : null].filter(Boolean).join('  ·  ')}
          </Text>
          <View style={s.cells}>
            {cells.map((x, i) => (
              <View key={x.label} style={[s.cell, i > 0 && s.cellBorder]}>
                <Text style={s.cellLabel} numberOfLines={1}>{x.label}</Text>
                <Text style={[s.cellValue, x.bad && { color: '#FCA5A5' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{x.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 1 · who to reach */}
        <Block title="Contacts">
          {contacts.length === 0 && !customer.whatsapp_group_link ? <Text style={s.empty}>No contact people saved.</Text> : null}
          {contacts.map((p, i) => (
            <View key={p.key} style={[s.line, i > 0 && s.border]}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{p.name}</Text>
                <Text style={s.sub} numberOfLines={1}>{[p.name.startsWith(p.role) ? null : p.role, p.phone].filter(Boolean).join('  ·  ')}</Text>
              </View>
              {p.phone ? (
                <>
                  <TouchableOpacity style={s.iconBtn} onPress={() => call(p.phone)} accessibilityLabel={`Call ${p.name || 'contact'}`}>
                    <Phone size={16} color={INK} strokeWidth={2.2} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.iconBtn, { backgroundColor: WA_LIGHT }]} onPress={() => whatsapp(p.phone)} accessibilityLabel={`WhatsApp ${p.name || 'contact'}`}>
                    <MessageCircle size={16} color={WA_INK} strokeWidth={2.2} />
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          ))}
          {customer.whatsapp_group_link ? (
            <TouchableOpacity style={[s.line, contacts.length > 0 && s.border]} onPress={() => Linking.openURL(customer.whatsapp_group_link!).catch(() => {})} activeOpacity={0.6}>
              <View style={[s.iconBtn, { backgroundColor: WA_LIGHT }]}><Users size={16} color={WA_INK} strokeWidth={2.2} /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{customer.whatsapp_group_name || 'WhatsApp group'}</Text>
                <Text style={s.sub}>WhatsApp group</Text>
              </View>
              <ChevronRight size={16} color="#A1A1AA" />
            </TouchableOpacity>
          ) : null}
        </Block>

        {/* 2 · open invoices — only when there are any */}
        {m && m.open.length > 0 ? (
          <Block title="Open invoices" count={m.open.length}>
            {invoices.map((inv, i) => {
              const late = daysOverdue(inv, now);
              const overdue = late !== null && late > 0;
              const label = late === null ? 'No due date' : overdue ? `${late} day${late === 1 ? '' : 's'} overdue` : late === 0 ? 'Due today' : `Due in ${-late} day${late === -1 ? '' : 's'}`;
              return (
                <View key={inv.id} style={[s.line, i > 0 && s.border]}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{inv.ref_id || 'Invoice'}</Text>
                    <Text style={[s.sub, overdue && { color: '#B42318', fontWeight: '600' }]}>{label}</Text>
                  </View>
                  <Text style={s.amount}>{fmtSar(inv.balance_due)}</Text>
                </View>
              );
            })}
            {m.open.length > 3 ? <More label={allInvoices ? 'Show less' : `Show all ${m.open.length}`} onPress={() => setAllInvoices((x) => !x)} /> : null}
          </Block>
        ) : null}

        {/* 3 · open trips; otherwise just the way into the full list */}
        {!c.tripsLoading && c.trips.shown.length === 0 ? (
          <TouchableOpacity style={[s.card, s.linkRow]} activeOpacity={0.6} onPress={() => router.push({ pathname: '/trips', params: { customerId: customer.id, customerName: niceName(customer.name) } })}>
            <Text style={s.rowTitle}>All trips</Text>
            <ChevronRight size={16} color="#A1A1AA" />
          </TouchableOpacity>
        ) : (
          <Block
            title="Open trips"
            count={c.trips.openCount || undefined}
            action={{ label: 'All trips', onPress: () => router.push({ pathname: '/trips', params: { customerId: customer.id, customerName: niceName(customer.name) } }) }}
          >
            {c.tripsLoading ? <Text style={s.empty}>Loading…</Text> : c.trips.shown.map((t, i) => {
              const r = routeOf(t);
              const chip = statusChip(t.status);
              const driver = t.driver ? niceName(`${t.driver.first_name} ${t.driver.last_name}`) : null;
              return (
                <TouchableOpacity key={t.id} style={[s.line, i > 0 && s.border]} activeOpacity={0.6} onPress={() => router.push({ pathname: '/trip-details', params: { id: t.id } })}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{r.from} → {r.to}{r.round ? ' ↺' : ''}</Text>
                    <Text style={s.sub} numberOfLines={1}>{[t.ref_id, driver ?? 'No driver yet'].filter(Boolean).join('  ·  ')}</Text>
                  </View>
                  <Text style={[s.state, { color: TONE[chip.tone].fg }]}>{chip.label}</Text>
                  <ChevronRight size={16} color="#A1A1AA" />
                </TouchableOpacity>
              );
            })}
          </Block>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}

/** A titled section: heading (with an optional count or link) above one white card. */
function Block({ title, count, action, children }: { title: string; count?: number; action?: { label: string; onPress: () => void }; children: React.ReactNode }) {
  return (
    <View style={s.block}>
      <View style={s.headRow}>
        <Text style={s.heading}>{title}</Text>
        {count ? <Text style={s.count}>{count}</Text> : null}
        {action ? (
          <TouchableOpacity style={s.headLink} onPress={action.onPress} hitSlop={8}>
            <Text style={s.link}>{action.label}</Text>
            <ChevronRight size={15} color={MUTED} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={s.card}>{children}</View>
    </View>
  );
}

function More({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.more, s.border]} onPress={onPress} activeOpacity={0.6}>
      <Text style={s.moreText}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  barBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER },
  barTitle: { fontSize: 16, fontWeight: '700', color: INK },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 18 },

  header: { backgroundColor: INK, borderRadius: 20, paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  name: { flex: 1, fontSize: 22, fontWeight: '700', color: Colors.white, letterSpacing: -0.4, lineHeight: 28 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.white, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  since: { fontSize: 13, color: ON_DARK_MUTED },
  cells: { flexDirection: 'row', marginTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  cell: { flex: 1, minWidth: 0, paddingVertical: 14, gap: 3 },
  cellBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.14)', paddingLeft: 12 },
  cellLabel: { fontSize: 12, color: ON_DARK_MUTED },
  cellValue: { fontSize: 17, fontWeight: '700', color: Colors.white, letterSpacing: -0.2, fontVariant: ['tabular-nums'], paddingRight: 8 },


  block: { gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  count: { fontSize: 13, fontWeight: '600', color: MUTED, backgroundColor: '#EAEAED', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  headLink: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2 },
  link: { fontSize: 13, fontWeight: '600', color: MUTED },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 16 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  border: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: INK },
  sub: { fontSize: 13, color: MUTED },
  amount: { fontSize: 15, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  state: { fontSize: 13, fontWeight: '600' },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 14, color: MUTED, paddingVertical: 14 },
  more: { paddingVertical: 12, alignItems: 'center' },
  moreText: { fontSize: 14, fontWeight: '600', color: INK },

});
