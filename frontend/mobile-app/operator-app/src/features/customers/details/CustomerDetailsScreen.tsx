/**
 * Route: /customer-details?id=… — one customer: what they owe, their trips,
 * quotations, contacts, saved places and account settings.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookUser, Building2, ChevronLeft, FileText, Info, MapPin, MapPinOff, MessageCircle, Pencil, Phone, Plus, Receipt, Route, Users } from 'lucide-react-native';
import { Colors, Spacing } from '@mercon/mobile-shared/theme/tokens';
import { TONE, statusChip } from '../../trips/details/tripDetailsModel';
import { QuotationCard } from '../../trips/create/components/StepJob';
import { Chip, CompanyAvatar, Section, SkeletonRows, fmtSar, niceName, tap } from '../../trips/create/components/ui';
import { daysOverdue, useCustomerDetail } from './useCustomerDetail';
import type { CustomerTrip } from './customerDetailApi';

const PAGE = '#EEF1F6';
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
  const [allQuotes, setAllQuotes] = useState(false);
  const [allPlaces, setAllPlaces] = useState(false);
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

  const top = (
    <View style={s.topBar}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
        <ChevronLeft size={24} color={Colors.charcoal} />
      </TouchableOpacity>
      <Text style={s.topTitle}>Customer</Text>
      {customer ? (
        <TouchableOpacity style={s.editBtn} onPress={() => router.push({ pathname: '/customer-edit', params: { id: customer.id } })} activeOpacity={0.75}>
          <Pencil size={14} color={Colors.charcoal} />
          <Text style={s.editText}>Edit</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (c.loading || !customer) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        {top}
        <View style={s.body}>
          {c.loading ? (
            <SkeletonRows rows={5} height={110} />
          ) : (
            <Section icon={Building2} tone="gray" title={c.notFound ? 'Customer not found' : 'Couldn’t load this customer'}>
              <Text style={s.muted}>{c.notFound ? 'It may have been removed.' : 'Go back and try again.'}</Text>
            </Section>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const mainPhone = customer.whatsapp_number || customer.primary_contact_phone || customer.contact_phone;
  const m = c.money;
  const invoices = m ? (allInvoices ? m.open : m.open.slice(0, 3)) : [];
  const quotes = allQuotes ? c.quotations : c.quotations.slice(0, 3);
  const places = allPlaces ? c.places : c.places.slice(0, 4);
  const noPin = c.places.filter((p) => p.lat == null || p.lng == null).length;
  const contacts = [
    { name: customer.primary_contact_person, phone: customer.primary_contact_phone, role: 'Primary' },
    { name: customer.secondary_contact_person, phone: customer.secondary_contact_phone, role: 'Secondary' },
  ].filter((x) => x.name || x.phone);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {top}
      <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}>
        {/* Identity + quick actions */}
        <View style={s.hero}>
          <View style={s.heroTop}>
            <CompanyAvatar name={customer.name} url={customer.logo_url} size={54} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.name} numberOfLines={2}>
                {niceName(customer.name)}
              </Text>
              <View style={s.chips}>
                <View style={[s.pill, { backgroundColor: customer.isActive ? '#EAF3DE' : '#F1EFE8' }]}>
                  <Text style={[s.pillText, { color: customer.isActive ? '#27500A' : '#444441' }]}>{customer.isActive ? 'Active' : 'Suspended'}</Text>
                </View>
                {customer.payment_terms ? (
                  <View style={[s.pill, { backgroundColor: Colors.gray100 }]}>
                    <Text style={[s.pillText, { color: Colors.gray700 }]}>{customer.payment_terms}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={s.muted}>Customer since {monthYear(customer.createdAt)}</Text>
            </View>
          </View>
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.action, { backgroundColor: Colors.primary }]}
              onPress={() => {
                tap();
                router.push({ pathname: '/create-trip', params: { customerId: customer.id } });
              }}
              activeOpacity={0.8}
            >
              <Plus size={15} color={Colors.white} />
              <Text style={[s.actionText, { color: Colors.white }]}>New trip</Text>
            </TouchableOpacity>
            {mainPhone ? (
              <>
                <TouchableOpacity style={[s.action, { backgroundColor: Colors.gray100 }]} onPress={() => call(customer.primary_contact_phone || customer.contact_phone)} activeOpacity={0.75}>
                  <Phone size={15} color={Colors.charcoal} />
                  <Text style={s.actionText}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.action, { backgroundColor: '#EAF3DE' }]} onPress={() => whatsapp(mainPhone)} activeOpacity={0.75}>
                  <MessageCircle size={15} color="#27500A" />
                  <Text style={[s.actionText, { color: '#27500A' }]}>WhatsApp</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>

        {/* Money owed */}
        <Section icon={Receipt} tone={m && m.overdue > 0 ? 'coral' : 'green'} title="Money owed" style={m && m.overdue > 0 ? s.overdueCard : undefined}>
          {c.moneyLoading ? (
            <SkeletonRows rows={1} height={56} />
          ) : !m ? (
            <Text style={s.muted}>{c.moneyFailed ? 'Couldn’t load invoices.' : 'No invoices yet.'}</Text>
          ) : (
            <>
              <View style={s.kpis}>
                <Kpi label="Outstanding" value={fmtSar(m.outstanding)} />
                <Kpi label={m.overdueCount ? `Overdue · ${m.overdueCount}` : 'Overdue'} value={fmtSar(m.overdue)} bad={m.overdue > 0} />
                <Kpi label="Paid" value={fmtSar(m.paid)} />
              </View>
              {m.open.length === 0 ? (
                <Text style={[s.muted, { marginTop: 8 }]}>Nothing open — every invoice is paid.</Text>
              ) : (
                invoices.map((inv, i) => {
                  const late = daysOverdue(inv, now);
                  const overdue = late !== null && late > 0;
                  const label = late === null ? 'no due date' : overdue ? `${late} day${late === 1 ? '' : 's'} overdue` : late === 0 ? 'due today' : `due in ${-late} day${late === -1 ? '' : 's'}`;
                  return (
                    <View key={inv.id} style={[s.listRow, i === 0 && { marginTop: 6 }]}>
                      <Text style={[s.rowTitle, { flex: 1 }]} numberOfLines={1}>
                        {inv.ref_id || 'Invoice'}
                      </Text>
                      <View style={[s.pill, { backgroundColor: overdue ? '#FCEBEB' : Colors.gray100 }]}>
                        <Text style={[s.pillText, { color: overdue ? '#A32D2D' : Colors.gray600 }]}>{label}</Text>
                      </View>
                      <Text style={s.amount}>{fmtSar(inv.balance_due)}</Text>
                    </View>
                  );
                })
              )}
              {m.open.length > 3 ? (
                <TouchableOpacity onPress={() => setAllInvoices((x) => !x)} hitSlop={8} style={{ paddingTop: 8 }}>
                  <Text style={s.link}>{allInvoices ? 'Show less' : `Show all ${m.open.length} open invoices`}</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={[s.muted, { marginTop: 6 }]}>Amounts in {m.currency}.</Text>
            </>
          )}
        </Section>

        {/* Trips */}
        <Section
          icon={Route}
          tone="blue"
          title="Trips"
          action={{ label: 'All trips', onPress: () => router.push({ pathname: '/trips', params: { customerId: customer.id, customerName: niceName(customer.name) } }) }}
        >
          {c.tripsLoading ? (
            <SkeletonRows rows={1} height={56} />
          ) : (
            <>
              <View style={s.kpis}>
                <Kpi label="On the road" value={String(c.trips.live.length)} color="#185FA5" />
                <Kpi label="This month" value={String(c.trips.monthCount)} />
                <Kpi label="Value this month" value={fmtSar(c.trips.monthValue)} />
              </View>
              {c.trips.shown.length === 0 ? (
                <Text style={[s.muted, { marginTop: 8 }]}>No open trips right now.</Text>
              ) : (
                c.trips.shown.map((t, i) => {
                  const r = routeOf(t);
                  const chip = statusChip(t.status);
                  const tone = TONE[chip.tone];
                  const driver = t.driver ? niceName(`${t.driver.first_name} ${t.driver.last_name}`) : null;
                  return (
                    <TouchableOpacity key={t.id} style={[s.listRow, i === 0 && { marginTop: 6 }]} activeOpacity={0.6} onPress={() => router.push({ pathname: '/trip-details', params: { id: t.id } })}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.rowTitle} numberOfLines={1}>
                          {r.from} → {r.to}
                          {r.round ? ' ↺' : ''}
                        </Text>
                        <Text style={s.muted} numberOfLines={1}>
                          {[t.ref_id, driver ?? 'no driver yet'].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <View style={[s.pill, { backgroundColor: tone.bg }]}>
                        <Text style={[s.pillText, { color: tone.fg }]}>{chip.label}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}
        </Section>

        {/* Quotations */}
        <Section
          icon={FileText}
          tone="violet"
          title="Quotations"
          badge={c.quotations.length ? <Chip label={String(c.quotations.length)} /> : undefined}
          action={c.quotations.length > 3 ? { label: allQuotes ? 'Less' : `All ${c.quotations.length}`, onPress: () => setAllQuotes((x) => !x) } : undefined}
        >
          {c.quotationsLoading ? (
            <SkeletonRows rows={2} height={52} />
          ) : c.quotations.length === 0 ? (
            <Text style={s.muted}>No quotations yet — one is saved the first time a trip is priced for a new route.</Text>
          ) : (
            quotes.map((q, i) => <QuotationCard key={q.id} q={q} first={i === 0} />)
          )}
        </Section>

        {/* Contacts */}
        <Section icon={BookUser} tone="green" title="Contacts">
          {contacts.length === 0 && !customer.whatsapp_group_link ? <Text style={s.muted}>No contact people saved.</Text> : null}
          {contacts.map((p, i) => (
            <View key={p.role} style={[s.listRow, i === 0 && { borderTopWidth: 0 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {niceName(p.name) || 'Contact'}
                </Text>
                <Text style={s.muted}>
                  {p.role}
                  {p.phone ? ` · ${p.phone}` : ''}
                </Text>
              </View>
              {p.phone ? (
                <>
                  <TouchableOpacity style={s.iconBtn} onPress={() => call(p.phone)} accessibilityLabel={`Call ${p.name || 'contact'}`}>
                    <Phone size={15} color={Colors.charcoal} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.iconBtn, { backgroundColor: '#EAF3DE' }]} onPress={() => whatsapp(p.phone)} accessibilityLabel={`WhatsApp ${p.name || 'contact'}`}>
                    <MessageCircle size={15} color="#27500A" />
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          ))}
          {customer.whatsapp_group_link ? (
            <TouchableOpacity style={[s.listRow, contacts.length === 0 && { borderTopWidth: 0 }]} onPress={() => Linking.openURL(customer.whatsapp_group_link!).catch(() => {})} activeOpacity={0.6}>
              <Users size={16} color="#27500A" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {customer.whatsapp_group_name || 'WhatsApp group'}
                </Text>
                <Text style={s.muted}>WhatsApp group</Text>
              </View>
              <Text style={s.link}>Open</Text>
            </TouchableOpacity>
          ) : null}
        </Section>

        {/* Saved places */}
        <Section
          icon={MapPin}
          tone="coral"
          title="Saved places"
          badge={c.places.length ? <Chip label={String(c.places.length)} /> : undefined}
          action={c.places.length > 4 ? { label: allPlaces ? 'Less' : `All ${c.places.length}`, onPress: () => setAllPlaces((x) => !x) } : undefined}
        >
          {c.placesLoading ? (
            <SkeletonRows rows={2} height={36} />
          ) : c.places.length === 0 ? (
            <Text style={s.muted}>No saved places. Places are added when trips are created.</Text>
          ) : (
            <>
              {places.map((p, i) => {
                const pinned = p.lat != null && p.lng != null;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.listRow, i === 0 && { borderTopWidth: 0 }]}
                    disabled={!pinned}
                    activeOpacity={0.6}
                    onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`).catch(() => {})}
                  >
                    {pinned ? <MapPin size={16} color="#1D9E75" /> : <MapPinOff size={16} color="#BA7517" />}
                    <Text style={[s.rowTitle, { flex: 1 }]} numberOfLines={1}>
                      {niceName(p.name)}
                      {p.city ? <Text style={s.muted}>{`  ·  ${niceName(p.city)}`}</Text> : null}
                    </Text>
                    {!pinned ? (
                      <View style={[s.pill, { backgroundColor: '#FAEEDA' }]}>
                        <Text style={[s.pillText, { color: '#633806' }]}>no map pin</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
              {noPin > 0 ? (
                <Text style={[s.muted, { marginTop: 6 }]}>
                  {noPin} place{noPin === 1 ? ' has' : 's have'} no map pin, so trip timing can only guess those stops.
                </Text>
              ) : null}
            </>
          )}
        </Section>

        {/* Account */}
        <Section icon={Info} tone="gray" title="Account">
          <Row label="Payment terms" value={customer.payment_terms || 'Not set'} first />
          <Row label="Driver updates" value={customer.driver_workflow === 'EXTERNAL_APP' ? 'Customer’s own app' : 'MERCON driver app'} />
          {customer.contact_phone ? <Row label="Main phone" value={customer.contact_phone} /> : null}
          {customer.whatsapp_number ? <Row label="WhatsApp" value={customer.whatsapp_number} /> : null}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({ label, value, bad, color }: { label: string; value: string; bad?: boolean; color?: string }) {
  return (
    <View style={[s.kpi, bad && { backgroundColor: '#FCEBEB' }]}>
      <Text style={[s.kpiLabel, bad && { color: '#A32D2D' }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[s.kpiValue, bad && { color: '#A32D2D' }, color ? { color } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Row({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[s.listRow, first && { borderTopWidth: 0 }]}>
      <Text style={[s.muted, { width: 110, marginTop: 0 }]}>{label}</Text>
      <Text style={[s.rowTitle, { flex: 1 }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  topTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.charcoal },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.white },
  editText: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  body: { padding: Spacing.md, paddingBottom: 120, gap: Spacing.sm },
  hero: { padding: Spacing.md, borderRadius: 18, backgroundColor: Colors.white },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { fontSize: 19, fontWeight: '800', color: Colors.charcoal },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillText: { fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, marginTop: Spacing.md },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12 },
  actionText: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  overdueCard: { borderColor: '#F7C1C1' },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: Colors.gray100, borderRadius: 12, padding: 10 },
  kpiLabel: { fontSize: 11, color: Colors.gray500, fontWeight: '500' },
  kpiValue: { fontSize: 16, fontWeight: '800', color: Colors.charcoal, marginTop: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.gray100 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.charcoal },
  amount: { fontSize: 14, fontWeight: '700', color: Colors.charcoal, minWidth: 64, textAlign: 'right' },
  muted: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  link: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' },
});
