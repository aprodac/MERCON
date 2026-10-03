/**
 * Route: /third-party-details?id= — one subcontracted carrier
 * (GET /third-party-providers/:id).
 *
 * A centred profile (logo initials, name, status, contact person), Call /
 * WhatsApp, three number tiles, what's on file, and the latest trips. Each
 * fact appears once; empty fields are left out instead of shown as "Not set".
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, RefreshControl, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, MessageCircle, Phone, SquarePen } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { operatorService, type OperatorThirdPartyProvider } from '@/lib/operator';
import { initialsOf, niceName } from '@/features/trips/create/components/ui';
import { PHASE_STYLE, phaseOf, statusText } from '@/features/trips/list/tripListModel';
import { ACTION, Chip, WA_INK, WA_LIGHT, tap } from '@/features/trips/details/components/parts';
import { compactSar } from '../format';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const digits = (v: string) => v.replace(/[^\d]/g, '');

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

  // What's on file — only the fields that have a value.
  const onFile: { label: string; value: string }[] = p ? ([
    { label: 'Phone', value: p.phone },
    { label: 'Email', value: p.email },
    { label: 'Address', value: p.address },
    { label: 'VAT / tax no.', value: p.tax_id },
    { label: 'Notes', value: p.notes },
  ].filter((r) => !!r.value) as { label: string; value: string }[]) : [];

  return (
    <SafeAreaView style={s.page} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F6F7" />
      <View style={s.bar}>
        <TouchableOpacity style={s.barBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/third-party'))} accessibilityLabel="Back">
          <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
        </TouchableOpacity>
        {p ? (
          <TouchableOpacity style={s.barBtn} onPress={() => router.push({ pathname: '/third-party-edit', params: { id: p.id } })} accessibilityLabel="Edit carrier">
            <SquarePen size={18} color={INK} strokeWidth={2.2} />
          </TouchableOpacity>
        ) : <View style={{ width: 44 }} />}
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
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
        >
          {/* 0 · who they are */}
          <View style={s.hero}>
            <View style={s.avatar}><Text style={s.avatarText}>{initialsOf(p.name)}</Text></View>
            <Text style={s.name}>{niceName(p.name)}</Text>
            {p.contact_person ? <Text style={s.sub}>{niceName(p.contact_person)}</Text> : null}
            <Chip label={active ? 'Active' : 'Inactive'} tone={active ? 'green' : 'gray'} dot style={{ alignSelf: 'center', marginTop: 4 }} />
          </View>

          {/* 1 · the two ways to reach them */}
          <View style={s.contact}>
            <TouchableOpacity style={[s.btn, s.btnDark, !p.phone && s.off]} disabled={!p.phone} activeOpacity={0.85} onPress={() => { tap(); Linking.openURL(`tel:${p.phone}`).catch(() => {}); }}>
              <Phone size={17} color={Colors.white} strokeWidth={2.3} />
              <Text style={[s.btnText, { color: Colors.white }]}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnWa, !p.phone && s.off]} disabled={!p.phone} activeOpacity={0.85} onPress={() => { tap(); Linking.openURL(`https://wa.me/${digits(p.phone!)}`).catch(() => {}); }}>
              <MessageCircle size={17} color={WA_INK} strokeWidth={2.3} />
              <Text style={[s.btnText, { color: WA_INK }]}>WhatsApp</Text>
            </TouchableOpacity>
          </View>

          {/* 2 · numbers */}
          <View style={s.tiles}>
            <Tile label="Trips given" value={String(p.total_trips ?? 0)} />
            <Tile label="Running now" value={String(p.active_trips ?? 0)} />
            <Tile label="Paid out" value={`SAR ${compactSar(p.total_cost)}`} />
          </View>

          {/* 3 · what's on file */}
          {onFile.length > 0 ? (
            <View style={s.block}>
              <Text style={s.heading}>Details</Text>
              <View style={s.card}>
                {onFile.map((r, i) => (
                  <View key={r.label} style={[s.info, i > 0 && s.border]}>
                    <Text style={s.infoLabel}>{r.label}</Text>
                    <Text style={s.infoValue} selectable>{r.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* 4 · latest trips, newest first */}
          <View style={s.block}>
            <Text style={s.heading}>Latest trips</Text>
            <View style={s.card}>
              {trips.length === 0 ? <Text style={s.empty}>No trips have been given to this carrier yet.</Text> : trips.map((t, i) => {
                const ps = PHASE_STYLE[phaseOf(t.status)];
                const d = new Date(t.planned_start || t.createdAt || '');
                return (
                  <TouchableOpacity key={t.id} style={[s.line, i > 0 && s.border]} activeOpacity={0.6} onPress={() => router.push({ pathname: '/trip-details', params: { id: t.id } })}>
                    <View style={s.date}>
                      <Text style={s.dateDay}>{Number.isNaN(d.getTime()) ? '—' : d.getDate()}</Text>
                      <Text style={s.dateMonth}>{Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short' })}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{niceName(t.customer?.name) || 'No customer'}</Text>
                      <Text style={s.sub} numberOfLines={1}>{t.ref_id ?? t.id.slice(0, 8)}</Text>
                    </View>
                    <Text style={[s.state, { color: ps.fg }]}>{statusText(t)}</Text>
                    <ChevronRight size={16} color="#A1A1AA" />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F6F7' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  barBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E9EC' },
  scroll: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 48, gap: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errTitle: { fontSize: 17, fontWeight: '800', color: INK },
  errText: { fontSize: 13, color: MUTED, marginTop: 4, textAlign: 'center' },
  retry: { height: 44, borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center', backgroundColor: INK, marginTop: 16 },
  retryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  hero: { alignItems: 'center', gap: 6, paddingTop: 4 },
  avatar: { width: 84, height: 84, borderRadius: 26, backgroundColor: '#F1EFE8', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#5F5E5A' },
  name: { fontSize: 22, fontWeight: '700', color: INK, letterSpacing: -0.4, textAlign: 'center', marginTop: 8 },
  sub: { fontSize: 13, color: MUTED },
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
  heading: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2, marginLeft: 2 },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 16 },
  info: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingVertical: 14 },
  border: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  infoLabel: { fontSize: 14, color: MUTED },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: INK },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: INK },
  state: { fontSize: 13, fontWeight: '600' },
  date: { width: 40, height: 44, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 16, fontWeight: '700', color: INK, lineHeight: 18 },
  dateMonth: { fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase' },
  empty: { fontSize: 14, color: MUTED, paddingVertical: 14 },
});
