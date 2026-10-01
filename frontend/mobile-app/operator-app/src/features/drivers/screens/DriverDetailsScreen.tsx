/**
 * Route: /driver-details?id= — one driver for an operator.
 *
 * A centred profile (photo, name, status), Call / WhatsApp, three number tiles,
 * then what they are doing now, the licence, uploaded documents and recent trips.
 * Each fact appears once.
 * Presentation only — every request and side effect lives in the hooks.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, ChevronRight, IdCard, MessageCircle, Phone, SquarePen, UserX,
} from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, ErrorState } from '@mercon/mobile-shared/ui';
import { documentTypeLabel } from '@/features/dashboard/components/DocumentTypeIcon';
import { ACTION, Card, Chip, INK, MUTED, PAGE, WA_INK, WA_LIGHT, tap } from '../../trips/details/components/parts';
import { niceName } from '../../trips/create/components/ui';
import { TONE, statusChip, type Tone } from '../../trips/details/tripDetailsModel';
import { DriverAvatar } from '../components/DriverAvatar';
import { SkeletonDriverDetails } from '../components/LoadingSkeleton';
import { useDriver, useDriverActions, useDriverTrips } from '../hooks';
import { driverDisplayInitials, driverDisplayName, formatDate, formatDaysLeft } from '../services/driverDetailsService';
import type { DriverDocumentStatus, DriverStatus } from '../types';

const RECENT_TRIPS = 5;

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
  const {
    driver, documents, documentsLoading, documentsError, performance, assignment, loading, refreshing, error, notFound, refresh,
  } = useDriver(id);
  const { trips } = useDriverTrips(id);
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
    if (loading) return <SkeletonDriverDetails />;
    if (notFound) return <Card><EmptyState Icon={UserX} title="Driver not found" subtitle="This driver may have been removed." /></Card>;
    if (error || !driver) return <Card><ErrorState message={error ?? 'Could not load this driver.'} onRetry={refresh} /></Card>;

    const status = STATUS[driver.status];
    const licenceBad = driver.licenseDaysLeft <= 30;
    const trip = assignment ? statusChip(assignment.status) : null;
    const stats = [
      { label: 'Trips done', value: String(performance.completedTrips) },
      { label: 'On time', value: performance.onTimeRatePct == null ? '—' : `${Math.round(performance.onTimeRatePct)}%` },
      { label: 'Joined', value: monthYear(driver.createdAt) },
    ];

    return (
      <>
        {/* 0 · who they are — centred, straight on the page */}
        <View style={s.hero}>
          <DriverAvatar initials={driverDisplayInitials(driver)} avatarUrl={driver.avatarUrl} size={84} />
          <Text style={s.name} numberOfLines={2}>{niceName(driverDisplayName(driver))}</Text>
          <Text style={s.sub} selectable>{[driver.refId, driver.phone].filter(Boolean).join('  ·  ') || '—'}</Text>
          <Chip label={status.label} tone={status.tone} dot style={{ alignSelf: 'center', marginTop: 4 }} />
        </View>

        {/* 1 · the two ways to reach them */}
        <View style={s.contact}>
          <TouchableOpacity style={[s.btn, s.btnDark, !canContact && s.off]} disabled={!canContact} onPress={() => { tap(); callDriver(); }} activeOpacity={0.85}>
            <Phone size={17} color={Colors.white} strokeWidth={2.3} />
            <Text style={[s.btnText, { color: Colors.white }]}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnWa, !phoneDigits && s.off]} disabled={!phoneDigits} onPress={() => { tap(); Linking.openURL(`https://wa.me/${phoneDigits}`).catch(() => {}); }} activeOpacity={0.85}>
            <MessageCircle size={17} color={WA_INK} strokeWidth={2.3} />
            <Text style={[s.btnText, { color: WA_INK }]}>WhatsApp</Text>
          </TouchableOpacity>
        </View>

        {/* 2 · three numbers, each its own tile */}
        <View style={s.tiles}>
          {stats.map((st) => (
            <View key={st.label} style={s.tile}>
              <Text style={s.tileValue} numberOfLines={1}>{st.value}</Text>
              <Text style={s.tileLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* 3 · what they are doing now */}
        <View style={s.block}>
          <Text style={s.heading}>Right now</Text>
          {assignment && trip ? (
            <TouchableOpacity style={s.now} activeOpacity={0.75} onPress={() => openTrip(assignment.tripId)}>
              <View style={[s.nowBar, { backgroundColor: TONE[trip.tone].dot }]} />
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text style={[s.nowState, { color: TONE[trip.tone].fg }]}>{trip.label}</Text>
                <Text style={s.rowTitle} numberOfLines={1}>{niceName(assignment.customerName ?? '') || 'No customer'}</Text>
                <Text style={s.sub} numberOfLines={1}>
                  {[assignment.refId, assignment.vehicle?.plateNumber].filter(Boolean).join('  ·  ')}
                </Text>
              </View>
              <ChevronRight size={18} color="#A1A1AA" />
            </TouchableOpacity>
          ) : (
            <View style={s.now}>
              <View style={[s.nowBar, { backgroundColor: '#D4D4D8' }]} />
              <Text style={s.empty}>Free — not on a trip.</Text>
            </View>
          )}
        </View>

        {/* 4 · licence, once */}
        <View style={s.block}>
          <Text style={s.heading}>Licence</Text>
          <View style={s.card}>
            <View style={s.line}>
              <View style={s.icon}><IdCard size={18} color={INK} strokeWidth={2} /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={s.mono} selectable>{driver.licenseNumber || '—'}</Text>
                <Text style={[s.sub, licenceBad && { color: TONE.red.fg, fontWeight: '600' }]}>{expiryText(driver.licenseExpiry, driver.licenseDaysLeft)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 5 · uploaded paperwork, most urgent first */}
        <View style={s.block}>
          <View style={s.headRow}>
            <Text style={s.heading}>Documents</Text>
            {documents.length ? <Text style={s.count}>{documents.length}</Text> : null}
          </View>
          <View style={s.card}>
            {documentsLoading ? <Text style={[s.empty, s.pad]}>Loading…</Text>
              : documentsError ? <ErrorState message={documentsError} onRetry={refresh} />
              : documents.length === 0 ? <Text style={[s.empty, s.pad]}>Nothing uploaded yet.</Text>
              : documents.map((d, i) => {
                const st = DOC_STATUS[d.displayStatus];
                return (
                  <View key={d.id} style={[s.line, i > 0 && s.lineBorder]}>
                    <View style={[s.dot, { backgroundColor: TONE[st.tone].dot }]} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{documentTypeLabel(d.docType)}</Text>
                      <Text style={s.sub} numberOfLines={1}>{d.expiryDate ? expiryText(d.expiryDate, d.daysLeft) : 'No expiry date'}</Text>
                    </View>
                    {d.displayStatus !== 'Valid' ? <Text style={[s.state, { color: TONE[st.tone].fg }]}>{st.label}</Text> : null}
                  </View>
                );
              })}
          </View>
        </View>

        {/* 6 · latest trips, newest first — date on the left like a calendar */}
        <View style={s.block}>
          <Text style={s.heading}>Recent trips</Text>
          <View style={s.card}>
            {recent.length === 0 ? <Text style={[s.empty, s.pad]}>No trips yet.</Text> : recent.map((t, i) => {
              const chip = statusChip(t.status);
              const d = new Date(t.planned_start ?? t.createdAt);
              return (
                <TouchableOpacity key={t.id} style={[s.line, i > 0 && s.lineBorder]} activeOpacity={0.6} onPress={() => openTrip(t.id)}>
                  <View style={s.date}>
                    <Text style={s.dateDay}>{d.getDate()}</Text>
                    <Text style={s.dateMonth}>{d.toLocaleDateString(undefined, { month: 'short' })}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{niceName(t.customer?.name ?? '') || 'No customer'}</Text>
                    <Text style={s.sub} numberOfLines={1}>{t.ref_id ?? 'Trip'}</Text>
                  </View>
                  <Text style={[s.state, { color: TONE[chip.tone].fg }]}>{chip.label}</Text>
                  <ChevronRight size={16} color="#A1A1AA" />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <View style={[s.bar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.barBtn} onPress={back} accessibilityLabel="Back">
          <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
        </TouchableOpacity>
        {driver ? (
          <TouchableOpacity style={s.barBtn} onPress={() => router.push({ pathname: '/driver-edit', params: { id } })} accessibilityLabel="Edit driver">
            <SquarePen size={18} color={INK} strokeWidth={2.2} />
          </TouchableOpacity>
        ) : <View style={{ width: 44 }} />}
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32 + insets.bottom, gap: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
      >
        {body()}
      </ScrollView>
    </View>
  );
}

/** "Sep 2025" */
function monthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
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
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
  barBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E9EC' },
  hero: { alignItems: 'center', gap: 6, paddingTop: 4 },
  name: { fontSize: 22, fontWeight: '700', color: INK, letterSpacing: -0.4, textAlign: 'center', marginTop: 8 },
  sub: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  contact: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 50, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnDark: { backgroundColor: ACTION },
  btnWa: { backgroundColor: WA_LIGHT },
  btnText: { fontSize: 15, fontWeight: '700' },
  off: { opacity: 0.4 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 14, paddingHorizontal: 12, gap: 3 },
  tileValue: { fontSize: 19, fontWeight: '700', color: INK, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 12, color: MUTED },
  block: { gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2, marginLeft: 2 },
  count: { fontSize: 13, fontWeight: '600', color: MUTED, backgroundColor: '#EAEAED', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 16 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  lineBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  now: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 14, paddingRight: 14, paddingLeft: 14, overflow: 'hidden' },
  nowBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  nowState: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: INK },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  mono: { fontSize: 16, fontWeight: '700', color: INK, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  state: { fontSize: 13, fontWeight: '600' },
  date: { width: 40, height: 44, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 16, fontWeight: '700', color: INK, lineHeight: 18 },
  dateMonth: { fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase' },
  empty: { fontSize: 14, color: MUTED },
  pad: { paddingVertical: 14 },
});
