/**
 * Route: /third-party-details?id= — one subcontracted carrier: who to call,
 * how much work they have had, and their latest trips (GET /third-party-providers/:id).
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, RefreshControl, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, Mail, MessageCircle, Pencil, Phone, type LucideIcon } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { operatorService, type OperatorThirdPartyProvider, type OperatorTrip } from '@/lib/operator';
import { initialsOf, niceName, tap } from '@/features/trips/create/components/ui';
import { PHASE_STYLE, phaseOf, statusText } from '@/features/trips/list/tripListModel';
import { compactSar } from '../format';

const INK = '#18181B';
const MUTED = '#6B6B76';
const digits = (s: string) => s.replace(/[^\d]/g, '');

export default function ThirdPartyDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [provider, setProvider] = useState<OperatorThirdPartyProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (pull?: boolean) => {
    if (!id) return;
    if (pull) setRefreshing(true);
    try {
      setProvider(await operatorService.thirdPartyProviderById(id));
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
  const active = p?.isActive ?? true;
  const trips = p?.trips ?? [];

  const contact: { key: string; label: string; icon: LucideIcon; onPress?: () => void }[] = p ? [
    { key: 'call', label: 'Call', icon: Phone, onPress: p.phone ? () => Linking.openURL(`tel:${p.phone}`).catch(() => {}) : undefined },
    { key: 'wa', label: 'WhatsApp', icon: MessageCircle, onPress: p.phone ? () => Linking.openURL(`https://wa.me/${digits(p.phone!)}`).catch(() => {}) : undefined },
    { key: 'mail', label: 'Email', icon: Mail, onPress: p.email ? () => Linking.openURL(`mailto:${p.email}`).catch(() => {}) : undefined },
  ] : [];

  return (
    <SafeAreaView style={s.page} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F6F7" />
      <View style={s.bar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <ArrowLeft size={19} color={INK} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={s.barTitle} numberOfLines={1}>Carrier</Text>
        {p ? (
          <TouchableOpacity style={s.editBtn} onPress={() => router.push({ pathname: '/third-party-edit', params: { id: p.id } })} accessibilityLabel="Edit carrier">
            <Pencil size={14} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={s.editText}>Edit</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!p ? (
        error ? (
          <View style={s.center}>
            <Text style={s.errTitle}>Couldn’t open this carrier</Text>
            <Text style={s.errText}>{error}</Text>
            <TouchableOpacity style={s.retry} onPress={() => load()}><Text style={s.retryText}>Retry</Text></TouchableOpacity>
          </View>
        ) : <ActivityIndicator color={Colors.primary} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
        >
          {/* Who */}
          <View style={s.card}>
            <View style={s.head}>
              <View style={s.avatar}><Text style={s.avatarText}>{initialsOf(p.name)}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.name}>{niceName(p.name)}</Text>
                <View style={[s.pill, { backgroundColor: active ? '#E7F6EC' : '#F1F1F3' }]}>
                  <View style={[s.pillDot, { backgroundColor: active ? '#1F9D55' : '#9898A4' }]} />
                  <Text style={[s.pillText, { color: active ? '#146C3B' : MUTED }]}>{active ? 'Active' : 'Inactive'}</Text>
                </View>
              </View>
            </View>
            <View style={s.actions}>
              {contact.map((a) => (
                <TouchableOpacity key={a.key} style={[s.action, !a.onPress && { opacity: 0.35 }]} disabled={!a.onPress} activeOpacity={0.7} onPress={() => { tap(); a.onPress?.(); }}>
                  <View style={s.actionIcon}><a.icon size={19} color={INK} strokeWidth={2.1} /></View>
                  <Text style={s.actionText}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Numbers */}
          <View style={s.stats}>
            <Stat label="Trips given" value={String(p.total_trips ?? 0)} />
            <Stat label="Running now" value={String(p.active_trips ?? 0)} />
            <Stat label="Paid out" value={compactSar(p.total_cost)} sub="SAR" />
          </View>

          {/* Details */}
          <Text style={s.section}>Details</Text>
          <View style={[s.card, { paddingVertical: 4 }]}>
            <Row label="Contact person" value={niceName(p.contact_person)} />
            <Row label="Phone" value={p.phone} />
            <Row label="Email" value={p.email} />
            <Row label="Address" value={p.address} />
            <Row label="VAT / tax number" value={p.tax_id} />
            <Row label="Notes" value={p.notes} last />
          </View>

          {/* Trips */}
          <Text style={s.section}>Latest trips</Text>
          {trips.length === 0 ? (
            <View style={s.card}><Text style={s.muted}>No trips have been given to this carrier yet.</Text></View>
          ) : (
            <View style={[s.card, { paddingVertical: 2 }]}>
              {trips.map((t, i) => <TripRow key={t.id} trip={t} last={i === trips.length - 1} onPress={() => router.push({ pathname: '/trip-details', params: { id: t.id } })} />)}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={s.statValue} numberOfLines={1}>{value}</Text>
      <Text style={s.statSub}>{sub ?? ' '}</Text>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  return (
    <View style={[s.row, !last && s.rowBorder]}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, !value && { color: '#B4B4BD', fontWeight: '400' }]} selectable={!!value}>{value || 'Not set'}</Text>
    </View>
  );
}

function TripRow({ trip: t, last, onPress }: { trip: OperatorTrip; last: boolean; onPress: () => void }) {
  const ps = PHASE_STYLE[phaseOf(t.status)];
  const day = t.planned_start || t.createdAt;
  return (
    <TouchableOpacity style={[s.trip, !last && s.rowBorder]} activeOpacity={0.7} onPress={onPress}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.tripCustomer} numberOfLines={1}>{niceName(t.customer?.name) || 'No customer'}</Text>
        <Text style={s.tripSub} numberOfLines={1}>
          {t.ref_id ?? t.id.slice(0, 8)}{day ? ` · ${new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
        </Text>
      </View>
      <View style={[s.pill, { backgroundColor: ps.bg, marginTop: 0 }]}>
        <Text style={[s.pillText, { color: ps.fg }]}>{statusText(t)}</Text>
      </View>
      <ChevronRight size={17} color="#B4B4BD" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F6F7' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingHorizontal: 16 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E9EC', alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: INK, letterSpacing: -0.3 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 12, backgroundColor: INK },
  editText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errTitle: { fontSize: 17, fontWeight: '800', color: INK },
  errText: { fontSize: 13, color: MUTED, marginTop: 4, textAlign: 'center' },
  retry: { height: 44, borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center', backgroundColor: INK, marginTop: 16 },
  retryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#F1EFE8', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 19, fontWeight: '800', color: '#5F5E5A' },
  name: { fontSize: 19, fontWeight: '800', color: INK, letterSpacing: -0.3 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 6 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12, fontWeight: '500', color: MUTED },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 12, paddingVertical: 12 },
  statLabel: { fontSize: 12, color: MUTED, fontWeight: '500' },
  statValue: { fontSize: 22, fontWeight: '800', color: INK, marginTop: 4, letterSpacing: -0.4 },
  statSub: { fontSize: 11, color: '#9898A4', marginTop: 1 },
  section: { fontSize: 15, fontWeight: '700', color: INK, marginTop: 8, marginLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F1F3' },
  rowLabel: { fontSize: 14, color: MUTED },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: INK },
  muted: { fontSize: 13, color: MUTED },
  trip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  tripCustomer: { fontSize: 15, fontWeight: '600', color: INK },
  tripSub: { fontSize: 12, color: MUTED, marginTop: 2 },
});
