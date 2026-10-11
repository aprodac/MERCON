/**
 * Route: /driver-details?id= — one driver for an operator, laid out like the
 * vehicle page: a compact summary card (photo, name, status) with the actions,
 * then tabs — Overview (now, numbers, licence) · Docs · Trips.
 * Each fact appears once.
 * Presentation only — every request and side effect lives in the hooks.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, ChevronLeft, ChevronRight, FileText, IdCard, MessageCircle, Phone, SquarePen, Truck, UserX,
} from 'lucide-react-native';
import { EmptyHint, PageTitle, SectionLabel, TabIcon, Tile } from '@/components/pageCues';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState } from '@mercon/mobile-shared/ui';
import { documentTypeLabel } from '@/features/dashboard/components/DocumentTypeIcon';
import { Card, Chip, INK, MUTED, PAGE, tap } from '../../trips/details/components/parts';
import { fmtSar, niceName } from '../../trips/create/components/ui';
import { TONE, statusChip, type Tone } from '../../trips/details/tripDetailsModel';
import { DriverAvatar } from '../components/DriverAvatar';
import { SkeletonDriverDetails } from '../components/LoadingSkeleton';
import { useDriver, useDriverActions, useDriverTrips } from '../hooks';
import { useDriverPayouts } from '../hooks/useDriverPayouts';
import { driverDisplayInitials, driverDisplayName, formatDate, formatDaysLeft } from '../services/driverDetailsService';
import type { DriverDocumentStatus, DriverStatus } from '../types';

const RECENT_TRIPS = 5;

type Tab = 'overview' | 'pay' | 'documents' | 'trips';

const STATUS: Record<DriverStatus, { label: string; tone: Tone }> = {
  Available: { label: 'Available', tone: 'green' },
  OnTrip: { label: 'On trip', tone: 'blue' },
  OffDuty: { label: 'Off duty', tone: 'gray' },
  Inactive: { label: 'Inactive', tone: 'gray' },
};

const DOC_STATUS: Record<DriverDocumentStatus, { label: string; tone: Tone }> = {
  Valid: { label: 'Valid', tone: 'green' },
  ExpiresSoon: { label: 'Expires soon', tone: 'red' },
  Expired: { label: 'Expired', tone: 'red' },
  PendingRenewal: { label: 'In review', tone: 'violet' },
};

export default function DriverDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const {
    driver, vehicle, documents, documentsNeedingAttention, documentsLoading, documentsError, performance, assignment, loading, refreshing, error, notFound, refresh,
  } = useDriver(id);
  const { trips } = useDriverTrips(id);
  const pay = useDriverPayouts(id, trips);
  const { callDriver, canContact } = useDriverActions(id, driver?.phone ?? null);

  const recent = useMemo(
    () => [...trips]
      .sort((a, b) => new Date(b.planned_start ?? b.createdAt).getTime() - new Date(a.planned_start ?? a.createdAt).getTime())
      .slice(0, RECENT_TRIPS),
    [trips],
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/drivers'));
  const openTrip = (tripId: string) => router.push({ pathname: '/trip-details', params: { id: tripId } });

  const phoneDigits = (driver?.phone ?? '').replace(/\D/g, '');
  const body = () => {
    if (loading) return <View style={s.pad16}><SkeletonDriverDetails /></View>;
    if (notFound) return <View style={s.pad16}><Card><EmptyState Icon={UserX} title="Driver not found" subtitle="This driver may have been removed." /></Card></View>;
    if (error || !driver) return <View style={s.pad16}><Card><ErrorState message={error ?? 'Could not load this driver.'} onRetry={refresh} /></Card></View>;

    const status = STATUS[driver.status];
    const onDuty = driver.status === 'Available' || driver.status === 'OnTrip';
    const licenceBad = driver.licenseDaysLeft <= 30;
    const trip = assignment ? statusChip(assignment.status) : null;

    const tabs: { id: Tab; label: string; badge?: number }[] = [
      { id: 'overview', label: 'Overview' },
      { id: 'pay', label: 'Payout' },
      { id: 'documents', label: 'Docs', badge: documentsNeedingAttention || undefined },
      { id: 'trips', label: 'Trips' },
    ];

    return (
      <>
        {/* 0 · who they are + the actions, one compact card */}
        <View style={s.pad16}>
          {/* Profile card: who they are, then one row per way to reach them */}
          <Card style={{ paddingVertical: 6 }}>
            <View style={[s.row, { paddingVertical: 10 }]}>
              <DriverAvatar initials={driverDisplayInitials(driver)} avatarUrl={driver.avatarUrl} size={68} />
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Text style={s.name} numberOfLines={2}>{niceName(driverDisplayName(driver))}</Text>
                <View style={s.metaRow}>
                  <View style={[s.pill, driver.status === 'OnTrip' && { backgroundColor: Colors.primaryLight }]}>
                    <View style={[s.statusDot, driver.status === 'OnTrip' && { backgroundColor: Colors.primary }, !onDuty && { backgroundColor: '#B4B4BC' }]} />
                    <Text style={[s.statusText, driver.status === 'OnTrip' && { color: Colors.primary }, !onDuty && { color: MUTED }]}>{status.label}</Text>
                  </View>
                  {driver.refId ? <Text style={s.sub} selectable>{driver.refId}</Text> : null}
                </View>
              </View>
            </View>

            <View style={[s.line, s.lineBorder]}>
              <Tile icon={Phone} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text style={s.rowLabel}>Phone</Text>
                <Text style={s.rowTitle} numberOfLines={1} selectable>{driver.phone || 'No phone number'}</Text>
              </View>
              <TouchableOpacity style={[s.round, s.roundSoft, !phoneDigits && s.off]} disabled={!phoneDigits} accessibilityLabel="WhatsApp driver" onPress={() => { tap(); Linking.openURL(`https://wa.me/${phoneDigits}`).catch(() => {}); }} activeOpacity={0.8}>
                <MessageCircle size={18} color={INK} strokeWidth={2.2} />
              </TouchableOpacity>
              <TouchableOpacity style={[s.round, { backgroundColor: Colors.charcoal }, !canContact && s.off]} disabled={!canContact} accessibilityLabel="Call driver" onPress={() => { tap(); callDriver(); }} activeOpacity={0.8}>
                <Phone size={17} color={Colors.white} strokeWidth={2.3} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.line, s.lineBorder]}
              disabled={!vehicle}
              activeOpacity={0.6}
              onPress={() => vehicle && router.push({ pathname: '/vehicle-details', params: { id: vehicle.id } })}
            >
              <Tile icon={Truck} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text style={s.rowLabel}>Truck</Text>
                <Text style={[s.rowTitle, !vehicle && { color: MUTED }]} numberOfLines={1}>{vehicle ? vehicle.plateNumber : 'No truck right now'}</Text>
              </View>
              {vehicle ? <ChevronRight size={18} color="#A1A1AA" /> : null}
            </TouchableOpacity>
          </Card>
        </View>

        {/* 1 · tabs */}
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

        <View style={s.body}>
          {tab === 'overview' ? (
            <>
              {/* What they are doing now */}
              {assignment && trip ? (
                <TouchableOpacity activeOpacity={0.75} onPress={() => openTrip(assignment.tripId)}>
                  <Card>
                    <View style={[s.row, { marginBottom: 10 }]}>
                      <SectionLabel flat>Right now</SectionLabel>
                      <Chip label={trip.label} tone={trip.tone} dot />
                    </View>
                    <View style={s.row}>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={s.rowTitle} numberOfLines={1}>{niceName(assignment.customerName ?? '') || 'No customer'}</Text>
                        <Text style={s.sub} numberOfLines={1}>{[assignment.refId, assignment.vehicle?.plateNumber].filter(Boolean).join('  ·  ')}</Text>
                      </View>
                      <ChevronRight size={18} color="#A1A1AA" />
                    </View>
                  </Card>
                </TouchableOpacity>
              ) : (
                <Card>
                  <SectionLabel>Right now</SectionLabel>
                  <EmptyHint>Free — not on a trip.</EmptyHint>
                </Card>
              )}

              {/* Three numbers, one strip */}
              <Card>
                <View style={s.figures}>
                  <Figure value={String(performance.completedTrips)} label="Trips done" />
                  <Figure value={performance.onTimeRatePct == null ? '—' : `${Math.round(performance.onTimeRatePct)}%`} label="On time" />
                  <Figure value={monthYear(driver.createdAt)} label="Joined" />
                </View>
              </Card>

              {/* Licence, once */}
              <Card>
                <SectionLabel>Licence</SectionLabel>
                <View style={s.row}>
                  <Tile icon={IdCard} />
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text style={s.mono} selectable>{driver.licenseNumber || '—'}</Text>
                    <Text style={[s.sub, licenceBad && { color: TONE.red.fg, fontWeight: '600' }]}>{expiryText(driver.licenseExpiry, driver.licenseDaysLeft)}</Text>
                  </View>
                </View>
              </Card>
            </>
          ) : null}

          {tab === 'pay' ? (
            pay.error ? (
              <Card><EmptyHint>Couldn’t load the payouts. Pull down to try again.</EmptyHint></Card>
            ) : (
              <>
                <Card>
                  <View style={[s.row, { marginBottom: 12 }]}>
                    <TouchableOpacity style={s.step} onPress={() => { tap(); pay.prev(); }} accessibilityLabel="Previous month" hitSlop={8}>
                      <ChevronLeft size={18} color={INK} strokeWidth={2.3} />
                    </TouchableOpacity>
                    <Text style={s.month}>{pay.monthLabel}</Text>
                    <TouchableOpacity style={[s.step, pay.isCurrent && s.off]} disabled={pay.isCurrent} onPress={() => { tap(); pay.next(); }} accessibilityLabel="Next month" hitSlop={8}>
                      <ChevronRight size={18} color={INK} strokeWidth={2.3} />
                    </TouchableOpacity>
                  </View>
                  <View style={s.figures}>
                    <Figure value={pay.loading ? '…' : fmtSar(pay.totals.earned)} label="Earned (SAR)" />
                    {pay.knowsPaid ? (
                      <>
                        <Figure value={pay.loading ? '…' : fmtSar(pay.totals.paid)} label="Paid" />
                        <Figure value={pay.loading ? '…' : fmtSar(pay.totals.owed)} label="Still to pay" accent={pay.totals.owed > 0} />
                      </>
                    ) : (
                      <Figure value={String(pay.totals.trips)} label="Trips with pay" />
                    )}
                  </View>
                </Card>
                <Card style={s.listCard}>
                  {pay.rows.length === 0 ? <EmptyHint>{pay.loading ? 'Loading…' : 'No trip pay in this month.'}</EmptyHint> : pay.rows.map((x, i) => {
                    const d = new Date(x.day);
                    return (
                      <TouchableOpacity key={x.key} style={[s.line, i > 0 && s.lineBorder]} activeOpacity={0.6} onPress={() => openTrip(x.tripId)}>
                        <View style={s.date}>
                          <Text style={s.dateDay}>{d.getDate()}</Text>
                          <Text style={s.dateMonth}>{d.toLocaleDateString('en-GB', { month: 'short' })}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                          <Text style={s.rowTitle} numberOfLines={1}>{niceName(x.title)}</Text>
                          {x.sub ? <Text style={s.sub} numberOfLines={1}>{x.sub}</Text> : null}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 1 }}>
                          <Text style={s.amount}>{fmtSar(x.amount)}</Text>
                          {x.paid === null ? null : <Text style={[s.sub, !x.paid && { color: Colors.primary, fontWeight: '600' }]}>{x.paid ? 'Paid' : 'To pay'}</Text>}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </Card>
              </>
            )
          ) : null}

          {tab === 'documents' ? (
            <Card style={s.listCard}>
              {documentsLoading ? <EmptyHint>Loading…</EmptyHint>
                : documentsError ? <ErrorState message={documentsError} onRetry={refresh} />
                : documents.length === 0 ? <EmptyHint>Nothing uploaded yet.</EmptyHint>
                : documents.map((d, i) => {
                  const st = DOC_STATUS[d.displayStatus];
                  const ok = d.displayStatus === 'Valid';
                  return (
                    <View key={d.id} style={[s.line, i > 0 && s.lineBorder]}>
                      <View style={[s.iconTile, { backgroundColor: TONE[st.tone].bg }]}>
                        <FileText size={16} color={TONE[st.tone].fg} strokeWidth={2.2} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <Text style={s.rowTitle} numberOfLines={1}>{documentTypeLabel(d.docType)}</Text>
                        <Text style={s.sub} numberOfLines={1}>{d.expiryDate ? expiryText(d.expiryDate, d.daysLeft) : 'No expiry date'}</Text>
                      </View>
                      {!ok ? <Text style={[s.state, { color: TONE[st.tone].fg }]}>{st.label}</Text> : null}
                    </View>
                  );
                })}
            </Card>
          ) : null}

          {tab === 'trips' ? (
            <Card style={s.listCard}>
              {recent.length === 0 ? <EmptyHint>No trips yet.</EmptyHint> : recent.map((t, i) => {
                const chip = statusChip(t.status);
                const d = new Date(t.planned_start ?? t.createdAt);
                return (
                  <TouchableOpacity key={t.id} style={[s.line, i > 0 && s.lineBorder]} activeOpacity={0.6} onPress={() => openTrip(t.id)}>
                    <View style={s.date}>
                      <Text style={s.dateDay}>{d.getDate()}</Text>
                      <Text style={s.dateMonth}>{d.toLocaleDateString('en-GB', { month: 'short' })}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{niceName(t.customer?.name ?? '') || 'No customer'}</Text>
                      <Text style={s.sub} numberOfLines={1}>{t.ref_id ?? 'Trip'}</Text>
                    </View>
                    <Chip label={chip.label} tone={chip.tone} />
                  </TouchableOpacity>
                );
              })}
            </Card>
          ) : null}
        </View>
      </>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <View style={[s.bar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity style={s.barBtn} onPress={back} accessibilityLabel="Back">
          <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
        </TouchableOpacity>
        <PageTitle title="Driver" />
        {driver ? (
          <TouchableOpacity style={s.barBtn} onPress={() => router.push({ pathname: '/driver-edit', params: { id } })} accessibilityLabel="Edit driver">
            <SquarePen size={18} color={INK} strokeWidth={2.2} />
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { refresh(); pay.refetch(); }} tintColor={Colors.primary} />}
      >
        {body()}
      </ScrollView>
    </View>
  );
}

function Figure({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[s.figureValue, accent && { color: Colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.figureLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** "Sep 2025" */
function monthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** One line for an expiry: the date, plus how long is left only when it is close or past. */
function expiryText(iso: string, daysLeft: number | null): string {
  const date = formatDate(iso);
  if (daysLeft == null) return `Valid until ${date}`;
  if (daysLeft < 0) return `Expired ${date}`;
  if (daysLeft <= 30) return `Expires ${date} · ${formatDaysLeft(daysLeft)}`;
  return `Valid until ${date}`;
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E9EC' },
  barTitle: { fontSize: 16, fontWeight: '700', color: INK },
  pad16: { paddingHorizontal: 16 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 20, fontWeight: '800', color: INK, letterSpacing: -0.3 },
  sub: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F1F1F3' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: INK },
  statusText: { fontSize: 12, fontWeight: '700', color: INK },
  rowLabel: { fontSize: 12, color: MUTED },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  roundSoft: { backgroundColor: '#F1F1F3' },
  off: { opacity: 0.4 },
  step: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  month: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: INK },
  amount: { fontSize: 15, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },

  tabsWrap: { paddingHorizontal: 16, paddingVertical: 12 },
  tabs: { flexDirection: 'row', gap: 4, backgroundColor: '#EAEAED', borderRadius: 12, padding: 3 },
  tab: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: 52, borderRadius: 9, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 1 },
  tabOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  tabTextOn: { color: INK, fontWeight: '700' },
  badge: { position: 'absolute', top: 4, right: 6, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: TONE.amber.dot, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800', color: Colors.white },

  body: { paddingHorizontal: 16, gap: 10 },
  label: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: INK },
  empty: { fontSize: 14, color: MUTED },
  figures: { flexDirection: 'row', gap: 10 },
  figureValue: { fontSize: 19, fontWeight: '700', color: INK, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  figureLabel: { fontSize: 12, color: MUTED },
  iconTile: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  mono: { fontSize: 16, fontWeight: '700', color: INK, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },

  listCard: { paddingVertical: 4 },
  listEmpty: { paddingVertical: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  lineBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  state: { fontSize: 13, fontWeight: '600' },
  date: { width: 40, height: 44, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 16, fontWeight: '700', color: INK, lineHeight: 18 },
  dateMonth: { fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase' },
});
