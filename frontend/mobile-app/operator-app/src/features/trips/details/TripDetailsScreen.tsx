/**
 * Route: /trip-details?id= — one trip for an operator.
 *
 * Map on top (MapLibre), then who / where / status, then three tabs:
 *   Updates — WhatsApp first: quick sends and the driver's photos, each with Send.
 *   Stops   — every stop with times, lateness, delays and screenshots to check.
 *   Details — pre-trip checks or trip summary, truck & driver, money, paperwork.
 * The next status step, WhatsApp and "more" stay pinned at the bottom.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Alert, Modal, Linking, StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Maximize2, MessageCircle, MoreHorizontal, X } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { chooseMedia } from '@mercon/mobile-shared/lib/camera';
import {
  operatorService, type DriverUpdate, type OperatorDriver, type OperatorTripDocument, type OperatorVehicle, type TripDocKind,
} from '../../../lib/operator';
import { PickerSheet, niceName } from '../create/components/ui';
import { useTripDetails } from './useTripDetails';
import { ago, hoursText, makeFormatters, nextActionFor, sortedStops, stopName, updateTitle, type QuickKind, type Stop } from './tripDetailsModel';
import { TripMap } from './components/TripMap';
import { TripHeader } from './components/TripHeader';
import { UpdatesTab } from './components/UpdatesTab';
import { StopsTab } from './components/StopsTab';
import { DetailsTab } from './components/DetailsTab';
import { ShareSheet, type ShareTarget } from './components/ShareSheet';
import { MediaViewer, type ViewerItem } from './components/MediaViewer';
import { TimeConfirmSheet } from './components/TimeConfirmSheet';
import { ActivitySheet, ChargesSheet, MoreSheet, UploadSheet } from './components/Sheets';
import { ACTION, INK, MUTED, PAGE, WA, tap } from './components/parts';

type Tab = 'updates' | 'stops' | 'details';
const MAP_H = 250;

export default function TripDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trip, overview, updates, whatsappApi, tz, phase, remaining, loading, refreshing, error, refresh, reload } = useTripDetails(id);
  const f = useMemo(() => makeFormatters(tz), [tz]);

  const [tab, setTab] = useState<Tab>('updates');
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<ShareTarget | null>(null);
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number; title: string; update?: DriverUpdate } | null>(null);
  const [timeCheck, setTimeCheck] = useState<{ doc: OperatorTripDocument; stop: Stop; stopLabel: string } | null>(null);
  const [sheet, setSheet] = useState<'more' | 'upload' | 'activity' | 'charges' | null>(null);
  const [fullMap, setFullMap] = useState(false);
  const [picker, setPicker] = useState<{ kind: 'driver' | 'truck'; drivers?: OperatorDriver[]; vehicles?: OperatorVehicle[] } | null>(null);
  const [uploading, setUploading] = useState(false);

  if (loading && !trip) {
    return (
      <View style={[s.center, { backgroundColor: PAGE }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }
  if (!trip || !phase) {
    return (
      <View style={[s.center, { backgroundColor: PAGE, padding: 24 }]}>
        <Text style={s.errTitle}>Couldn’t open this trip</Text>
        <Text style={s.errText}>{error ?? 'Trip not found'}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <TouchableOpacity style={s.errBtn} onPress={() => router.back()}><Text style={s.errBtnText}>Go back</Text></TouchableOpacity>
          <TouchableOpacity style={[s.errBtn, { backgroundColor: ACTION }]} onPress={refresh}><Text style={[s.errBtnText, { color: Colors.white }]}>Retry</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  const stops = sortedStops(trip);
  const next = nextActionFor(trip.status);
  const position = overview?.unit?.position ? { lat: overview.unit.position.lat, lng: overview.unit.position.lng } : null;
  const unsentUpdates = updates.filter((u) => u.unsent_count > 0).length;
  const gps = overview?.unit?.position;

  // ── Actions ────────────────────────────────────────────────────────────────
  const advance = () => {
    if (!next) return;
    const run = async () => {
      setBusy(true);
      try {
        await next.run(trip.id);
        reload();
      } catch (e) {
        Alert.alert('Could not update the trip', getApiErrorMessage(e));
      } finally {
        setBusy(false);
      }
    };
    if (next.confirm) Alert.alert(next.confirm.title, next.confirm.message, [{ text: 'Not yet', style: 'cancel' }, { text: 'Confirm', onPress: run }]);
    else run();
  };

  const cancelTrip = () => {
    Alert.alert('Cancel this trip?', 'The driver and truck are freed. This cannot be undone.', [
      { text: 'Keep trip', style: 'cancel' },
      {
        text: 'Cancel trip',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await operatorService.updateTripStatus(trip.id, 'Cancelled');
            reload();
          } catch (e) {
            Alert.alert('Could not cancel', getApiErrorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const openChange = async (kind: 'driver' | 'truck') => {
    try {
      if (kind === 'driver') setPicker({ kind, drivers: await operatorService.availableDrivers() });
      else setPicker({ kind, vehicles: await operatorService.availableVehicles() });
    } catch (e) {
      Alert.alert(kind === 'driver' ? 'Could not load drivers' : 'Could not load trucks', getApiErrorMessage(e));
    }
  };

  const applyChange = async (value: string) => {
    if (!picker) return;
    setBusy(true);
    try {
      if (picker.kind === 'driver') await operatorService.replaceDriver(trip.id, value);
      else await operatorService.replaceVehicle(trip.id, value);
      reload();
    } catch (e) {
      Alert.alert(picker.kind === 'driver' ? 'Could not change the driver' : 'Could not change the truck', getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (kind: TripDocKind) => {
    try {
      const media = await chooseMedia();
      if (!media) return;
      setUploading(true);
      await operatorService.uploadTripDocument(trip.id, { uri: media.uri, name: media.fileName ?? undefined, mimeType: media.mimeType }, kind);
      reload();
    } catch (e) {
      Alert.alert('Upload failed', getApiErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const openUpdate = (u: DriverUpdate, index: number) => {
    const where = u.stop?.name ?? 'Trip';
    setViewer({
      title: `${updateTitle(u)} · ${where}`,
      index,
      update: u,
      items: u.items.map((m) => ({ id: m.id, url: m.url, kind: m.kind, caption: f.smart(m.captured_at) })),
    });
  };

  const openStopMedia = (st: Stop) => {
    const ups = updates.filter((u) => u.stop?.id === st.id);
    const items = ups.flatMap((u) => u.items.map((m) => ({ id: m.id, url: m.url, kind: m.kind, caption: `${updateTitle(u)} · ${f.smart(m.captured_at)}` })));
    if (items.length) setViewer({ title: stopName(st, stops.indexOf(st)), index: 0, items, update: ups.length === 1 ? ups[0] : undefined });
  };

  const openDoc = (d: OperatorTripDocument) => {
    const url = resolveMediaUrl(d.file_url);
    if (!url) return;
    const isImage = d.mime_type?.startsWith('image') || /\.(jpe?g|png|webp)$/i.test(d.file_url);
    if (isImage) setViewer({ title: d.documentType?.name || d.title || d.doc_type || 'Document', index: 0, items: [{ id: d.id, url: d.file_url, kind: 'photo', caption: f.date(d.createdAt) }] });
    else Linking.openURL(url).catch(() => {});
  };

  const quick = (kind: QuickKind) => setShare({ type: 'quick', kind });

  // ── Render ─────────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string }[] = [
    { id: 'updates', label: unsentUpdates ? `Updates · ${unsentUpdates}` : 'Updates' },
    { id: 'stops', label: `Stops · ${stops.length}` },
    { id: 'details', label: 'Details' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <ScrollView
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} progressViewOffset={insets.top} />}
      >
        {/* 0 · map + header */}
        <View>
          <TripMap stops={stops} overview={overview} phase={phase} height={MAP_H} padding={{ top: insets.top + 60, bottom: 50 }} />
          <View style={s.mapBottom}>
            {gps && phase === 'active' ? (
              <View style={s.gpsChip}>
                <View style={[s.gpsDot, { backgroundColor: gps.fresh ? '#1F9D55' : '#D97706' }]} />
                <Text style={s.gpsText}>
                  {gps.fresh ? 'Live' : `Seen ${ago(gps.recorded_at)}`}
                  {remaining ? ` · ${remaining.approx ? '~' : ''}${Math.round(remaining.km)} km · ${hoursText(remaining.sec).toLowerCase()}` : ''}
                </Text>
              </View>
            ) : <View />}
            <TouchableOpacity style={s.mapBtn} onPress={() => setFullMap(true)} accessibilityLabel="Open full-screen map">
              <Maximize2 size={16} color={INK} strokeWidth={2.3} />
            </TouchableOpacity>
          </View>
          <View style={s.sheetTop}>
            <TripHeader trip={trip} phase={phase} f={f} />
          </View>
        </View>

        {/* 1 · tabs (sticky) */}
        <View style={s.tabsWrap}>
          <View style={s.tabs}>
            {tabs.map((t) => {
              const on = t.id === tab;
              return (
                <TouchableOpacity key={t.id} style={[s.tab, on && s.tabOn]} onPress={() => { if (!on) tap(); setTab(t.id); }} activeOpacity={0.8}>
                  <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 2 · tab body */}
        <View style={{ paddingHorizontal: 12, paddingTop: 4 }}>
          {tab === 'updates' ? (
            <UpdatesTab
              trip={trip}
              phase={phase}
              updates={updates}
              f={f}
              onQuick={quick}
              onSendUpdate={(u) => setShare({ type: 'update', update: u })}
              onOpenMedia={openUpdate}
              onAddPhoto={() => setSheet('upload')}
            />
          ) : tab === 'stops' ? (
            <StopsTab
              trip={trip}
              phase={phase}
              updates={updates}
              f={f}
              onOpenStopMedia={openStopMedia}
              onConfirmTime={(doc, st) => setTimeCheck({ doc, stop: st, stopLabel: stopName(st, stops.indexOf(st)) })}
            />
          ) : (
            <DetailsTab
              trip={trip}
              phase={phase}
              overview={overview}
              f={f}
              onChange={openChange}
              onCharges={() => setSheet('charges')}
              onUpload={() => setSheet('upload')}
              onActivity={() => setSheet('activity')}
              onOpenDoc={openDoc}
            />
          )}
        </View>
      </ScrollView>

      {/* Back, floating over the map and content */}
      <TouchableOpacity style={[s.back, { top: insets.top + 8 }]} onPress={() => router.back()} accessibilityLabel="Back">
        <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
      </TouchableOpacity>

      {/* Bottom bar */}
      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <TouchableOpacity style={[s.barIcon, { backgroundColor: WA }]} onPress={() => quick('status')} accessibilityLabel="Send status on WhatsApp">
          <MessageCircle size={22} color={Colors.white} strokeWidth={2.3} />
        </TouchableOpacity>
        {next ? (
          <TouchableOpacity style={[s.primary, busy && { opacity: 0.7 }]} onPress={advance} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={Colors.white} /> : (
              <>
                <Check size={18} color={Colors.white} strokeWidth={2.8} />
                <Text style={s.primaryText} numberOfLines={1}>{next.label}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={[s.primary, { backgroundColor: '#F1F3F7' }]}>
            <Text style={[s.primaryText, { color: MUTED }]} numberOfLines={1}>
              {phase === 'done' ? (trip.status === 'Invoiced' ? 'Invoiced' : 'Delivered') : phase === 'cancelled' ? 'Cancelled' : 'No next step'}
            </Text>
          </View>
        )}
        <TouchableOpacity style={[s.barIcon, { backgroundColor: '#F1F3F7' }]} onPress={() => setSheet('more')} accessibilityLabel="More actions">
          {uploading ? <ActivityIndicator color={INK} /> : <MoreHorizontal size={22} color={INK} />}
        </TouchableOpacity>
      </View>

      {/* Sheets */}
      <ShareSheet target={share} onClose={() => setShare(null)} trip={trip} phase={phase} f={f} position={position} remaining={remaining} whatsappApi={whatsappApi} onShared={reload} />
      <MediaViewer
        items={viewer?.items ?? null}
        startIndex={viewer?.index ?? 0}
        title={viewer?.title ?? ''}
        onClose={() => setViewer(null)}
        onSend={viewer?.update ? () => { const u = viewer.update!; setViewer(null); setTimeout(() => setShare({ type: 'update', update: u }), 250); } : undefined}
      />
      <TimeConfirmSheet target={timeCheck} tripId={trip.id} tz={tz} onClose={() => setTimeCheck(null)} onDone={reload} />
      <MoreSheet
        visible={sheet === 'more'}
        trip={trip}
        onClose={() => setSheet(null)}
        onChange={openChange}
        onCharges={() => setSheet('charges')}
        onUpload={() => setSheet('upload')}
        onActivity={() => setSheet('activity')}
        onCancel={cancelTrip}
      />
      <UploadSheet visible={sheet === 'upload'} onClose={() => setSheet(null)} onPick={upload} />
      <ActivitySheet visible={sheet === 'activity'} trip={trip} f={f} onClose={() => setSheet(null)} />
      <ChargesSheet visible={sheet === 'charges'} trip={trip} onClose={() => setSheet(null)} onSaved={reload} />
      <PickerSheet
        visible={!!picker}
        title={picker?.kind === 'driver' ? 'Change driver' : 'Change truck'}
        options={
          picker?.kind === 'driver'
            ? (picker.drivers ?? []).map((d) => ({ value: d.id, label: niceName(`${d.first_name} ${d.last_name}`), sub: [d.ref_id, d.phone_primary].filter(Boolean).join(' · ') }))
            : (picker?.vehicles ?? []).map((v) => ({ value: v.id, label: v.plate_number, sub: [v.capacity_kg ? `${Math.round(v.capacity_kg / 1000)} ton` : null, v.asset_type].filter(Boolean).join(' · ') }))
        }
        value={picker?.kind === 'driver' ? trip.driver?.id : trip.vehicle?.id}
        onSelect={(value) => applyChange(value)}
        onClose={() => setPicker(null)}
        searchPlaceholder={picker?.kind === 'driver' ? 'Search drivers' : 'Search trucks'}
        emptyText={picker?.kind === 'driver' ? 'No drivers available right now' : 'No trucks available right now'}
      />

      {/* Full-screen map */}
      <Modal visible={fullMap} animationType="slide" onRequestClose={() => setFullMap(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: PAGE }}>
          <TripMap stops={stops} overview={overview} phase={phase} interactive padding={{ top: insets.top + 70, bottom: 60 }} />
          <TouchableOpacity style={[s.back, { top: insets.top + 8 }]} onPress={() => setFullMap(false)} accessibilityLabel="Close map">
            <X size={20} color={INK} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 };

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errTitle: { fontSize: 17, fontWeight: '800', color: INK },
  errText: { fontSize: 13, color: MUTED, marginTop: 4, textAlign: 'center' },
  errBtn: { height: 44, borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center', backgroundColor: Colors.white },
  errBtnText: { fontSize: 14, fontWeight: '800', color: INK },
  back: { position: 'absolute', left: 14, width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', ...shadow },
  mapBottom: { position: 'absolute', left: 14, right: 14, top: MAP_H - 76, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gpsChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, ...shadow },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsText: { fontSize: 12, fontWeight: '700', color: INK },
  mapBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', ...shadow },
  sheetTop: { marginTop: -24, backgroundColor: PAGE, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 12, paddingTop: 12 },
  tabsWrap: { backgroundColor: PAGE, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  tabs: { flexDirection: 'row', gap: 4, backgroundColor: '#E1E4EC', borderRadius: 13, padding: 3 },
  tab: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '700', color: '#4A4A55' },
  tabTextOn: { color: INK, fontWeight: '800' },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 10,
    backgroundColor: 'rgba(255,255,255,0.98)', borderTopWidth: 1, borderTopColor: '#E4E7EE',
    shadowColor: '#14141E', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: -6 }, elevation: 12,
  },
  barIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1, height: 52, borderRadius: 14, backgroundColor: ACTION, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 },
  primaryText: { color: Colors.white, fontSize: 16, fontWeight: '800' },
});
