/**
 * Route: /trip-details?id= — one trip for an operator.
 *
 * Map on top (MapLibre), then who / where / status, then three tabs:
 *   Updates — WhatsApp first: quick sends and the driver's photos, each with Send.
 *   Stops   — every stop with times, lateness, delays and screenshots to check.
 *   Details — pre-trip checks or trip summary, truck & driver, financials, paperwork.
 * The next status step, WhatsApp and "more" stay pinned at the bottom.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Alert, Modal, Linking, StatusBar,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, LayoutList, Maximize2, MessageCircle, MoreHorizontal, Navigation, Phone, Route, Send, X, type LucideIcon } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { chooseMedia } from '@mercon/mobile-shared/lib/camera';
import {
  operatorService, type DriverUpdate, type OperatorDriver, type OperatorTripDocument, type OperatorVehicle, type TripDocKind,
} from '../../../lib/operator';
import { PickerSheet, niceName } from '../create/components/ui';
import { useTripDetails } from './useTripDetails';
import { ago, digits, hoursText, makeFormatters, mapsLink, nextActionFor, sendStatus, sortedStops, stopName, updateTitle, type QuickKind, type Stop } from './tripDetailsModel';
import { TripMap } from './components/TripMap';
import { TripHeader } from './components/TripHeader';
import { StopsTab } from './components/StopsTab';
import { DetailsTab } from './components/DetailsTab';
import { ShareSheet, type ShareTarget } from './components/ShareSheet';
import { MediaViewer, type ViewerItem } from './components/MediaViewer';
import { TripTimesSheet } from './components/TripTimesSheet';
import { PinSheet } from './components/PinSheet';
import { ActivitySheet, ChargesSheet, MoreSheet, UploadSheet } from './components/Sheets';
import { ACTION, INK, MUTED, PAGE, WA, WA_INK, WA_LIGHT, tap } from './components/parts';
import { shareTextToWhatsApp } from '../../dashboard/components/ActiveTripsSection';

/** Under the More sheet's tracking row: has the customer looked at it? */
function trackingSub(opens: number, last: string | null): string {
  return opens > 0 && last ? `Customer opened it ${opens}× · ${ago(last)}` : 'Not opened yet · send, open or replace';
}

type Tab = 'stops' | 'details';
const MAP_H = 320;

export default function TripDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Links from the home's "Needs action" cards can open a tab, a message or a picker straight away;
  // a driver's update (push or Activity) opens on its stop (`stop`) or on the photos it sent (`photo`).
  const params = useLocalSearchParams<{ id: string; tab?: string; share?: string; update?: string; assign?: string; times?: string; stop?: string; photo?: string }>();
  const { id } = params;
  const { trip, overview, updates, whatsappApi, tz, phase, remaining, tracking, trackingUrl, refreshTracking, loading, refreshing, error, refresh, reload } = useTripDetails(id);
  const f = useMemo(() => makeFormatters(tz), [tz]);

  const [tab, setTab] = useState<Tab>(params.tab === 'stops' || params.stop || params.photo ? 'stops' : 'details');
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<ShareTarget | null>(null);
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number; title: string; update?: DriverUpdate } | null>(null);
  const [checkingTimes, setCheckingTimes] = useState(false);
  const [pinTarget, setPinTarget] = useState<{ stop: Stop; label: string } | null>(null);
  const [sheet, setSheet] = useState<'more' | 'upload' | 'activity' | 'charges' | null>(null);
  const [fullMap, setFullMap] = useState(false);
  const [picker, setPicker] = useState<{ kind: 'driver' | 'truck'; drivers?: OperatorDriver[]; vehicles?: OperatorVehicle[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  // Past the map, a solid top bar takes over so content doesn't slide under the clock and the Back button.
  const [pastMap, setPastMap] = useState(false);

  // Once the trip is here: open what the link asked for (only once).
  const [linkDone, setLinkDone] = useState(false);
  if (trip && !linkDone) {
    setLinkDone(true);
    if (params.share === 'delay' || params.share === 'status' || params.share === 'assignment') setShare({ type: 'quick', kind: params.share });
    if (params.times === '1') setCheckingTimes(true);
  }
  // `share=update&update=<key>` (Notifications → From drivers → Send): open the share sheet on that
  // photo set once the trip's updates have arrived (they load after the trip itself).
  const [updateLinkDone, setUpdateLinkDone] = useState(false);
  if (params.share === 'update' && params.update && !updateLinkDone && trip) {
    const u = updates.find((x) => x.key === params.update);
    if (u) {
      setUpdateLinkDone(true);
      setShare({ type: 'update', update: u });
    }
  }
  // `stop=<id>`: scroll the Stops tab to that stop and tint it for a few seconds.
  const scrollRef = useRef<ScrollView>(null);
  const tabBodyY = useRef(0);
  const [focusStop, setFocusStop] = useState<string | null>(params.stop ?? null);
  const scrolledToStop = useRef(false);
  const onStopLayout = useCallback((stopId: string, y: number) => {
    if (stopId !== params.stop || scrolledToStop.current) return;
    scrolledToStop.current = true;
    // After this frame, so the tab body's own position is known too.
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, tabBodyY.current + y - insets.top - 80), animated: true });
    }, 150);
    setTimeout(() => setFocusStop(null), 4000);
  }, [params.stop, insets.top]);
  // `photo=<document id>`: open the viewer on the photo set holding it once the trip's
  // updates arrive. Photos older than the updates window stay on the stop instead.
  const [photoLinkDone, setPhotoLinkDone] = useState(false);
  const assignKind = params.assign === 'driver' || params.assign === 'truck' ? params.assign : null;
  const tripLoaded = !!trip;
  useEffect(() => {
    if (!tripLoaded || !assignKind) return;
    let live = true;
    (assignKind === 'driver' ? operatorService.availableDrivers() : operatorService.availableVehicles())
      .then((list) => {
        if (!live) return;
        setPicker(assignKind === 'driver' ? { kind: 'driver', drivers: list as OperatorDriver[] } : { kind: 'truck', vehicles: list as OperatorVehicle[] });
      })
      .catch(() => {});
    return () => { live = false; };
  }, [tripLoaded, assignKind]);

  // Back from the link's page: it may have been replaced or turned off there.
  const linkManaged = useRef(false);
  const refreshTrackingRef = useRef(refreshTracking);
  useEffect(() => { refreshTrackingRef.current = refreshTracking; });
  useFocusEffect(useCallback(() => {
    if (linkManaged.current) {
      linkManaged.current = false;
      refreshTrackingRef.current();
    }
  }, []));

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


  const openPhotos = (u: DriverUpdate, index: number) => {
    const st = stops.find((x) => x.id === u.stop?.id);
    const items = u.items.map((m) => ({ id: m.id, url: m.url, kind: m.kind, caption: `${updateTitle(u)} · ${f.smart(m.captured_at)}`, sent: u.sent_ids.includes(m.id) }));
    if (items.length) setViewer({ title: st ? stopName(st, stops.indexOf(st)) : updateTitle(u), index, items, update: u });
  };

  const openDoc = (d: OperatorTripDocument) => {
    const url = resolveMediaUrl(d.file_url);
    if (!url) return;
    const isImage = d.mime_type?.startsWith('image') || /\.(jpe?g|png|webp)$/i.test(d.file_url);
    if (isImage) setViewer({ title: d.documentType?.name || d.title || d.doc_type || 'Document', index: 0, items: [{ id: d.id, url: d.file_url, kind: 'photo', caption: f.date(d.createdAt) }] });
    else Linking.openURL(url).catch(() => {});
  };

  if (params.photo && !photoLinkDone) {
    const u = updates.find((x) => x.items.some((m) => m.id === params.photo));
    if (u) {
      setPhotoLinkDone(true);
      openPhotos(u, Math.max(0, u.items.findIndex((m) => m.id === params.photo)));
    }
  }

  const quick = (kind: QuickKind) => setShare({ type: 'quick', kind });

  // The customer tracking link: send it, or manage it (open, expiry, what it shows, history, new link).
  const trackingActions = () => {
    const url = tracking?.url;
    if (!url) return;
    const head = [trip.ref_id, trip.vehicle?.plate_number ?? trip.third_party_vehicle_plate].filter(Boolean).join(' · ');
    // Three buttons at most — Android shows no more.
    Alert.alert('Customer tracking link', url, [
      { text: 'Send on WhatsApp', onPress: () => { shareTextToWhatsApp(`*${head}*\nTrack your truck live: ${url}`, 'Tracking link').catch(() => {}); } },
      {
        text: 'Manage link…',
        onPress: () => {
          linkManaged.current = true;
          router.push({ pathname: '/link-details', params: { kind: 'trip', trip: trip.id } });
        },
      },
      { text: 'Close', style: 'cancel' },
    ]);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: LucideIcon; badge?: number }[] = [
    { id: 'details', label: 'Details', icon: LayoutList },
    { id: 'stops', label: 'Stops', icon: Route, badge: undefined },
  ];

  // One-tap actions under the header: the things an operator does most on a call.
  const driverPhone = trip.is_third_party ? trip.third_party_driver_phone : trip.driver?.phone_primary;
  const nextIdx = stops.findIndex((st) => !st.actual_arrival);
  const target = phase === 'active' && nextIdx >= 0 ? stops[nextIdx] : stops[stops.length - 1];
  const hasTarget = !!target && Number.isFinite(target.location_lat) && !!(target.location_lat || target.location_lng);
  // Each has its own colour so they read at a glance; a missing phone / pin says why instead of just fading.
  const actions: { key: string; label: string; icon: LucideIcon; fg: string; bg: string; onPress?: () => void; off?: string }[] = [
    { key: 'call', label: 'Call driver', icon: Phone, fg: '#1D4ED8', bg: '#E8EFFD', onPress: driverPhone ? () => Linking.openURL(`tel:${driverPhone}`).catch(() => {}) : undefined, off: 'No phone' },
    { key: 'wa', label: 'WhatsApp', icon: MessageCircle, fg: WA_INK, bg: WA_LIGHT, onPress: driverPhone ? () => Linking.openURL(`https://wa.me/${digits(driverPhone)}`).catch(() => {}) : undefined, off: 'No phone' },
    { key: 'nav', label: phase === 'active' && nextIdx >= 0 ? 'To next stop' : 'Directions', icon: Navigation, fg: '#6D28D9', bg: '#F1EBFD', onPress: hasTarget ? () => Linking.openURL(mapsLink(target.location_lat, target.location_lng)).catch(() => {}) : undefined, off: 'No pin' },
    { key: 'status', label: 'Send status', icon: Send, fg: '#C2410C', bg: '#FFEFE6', onPress: () => quick('status') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <ScrollView
        ref={scrollRef}
        onScroll={(e) => { const v = e.nativeEvent.contentOffset.y > MAP_H - insets.top - 70; if (v !== pastMap) setPastMap(v); }}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: (next ? 110 : 32) + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} progressViewOffset={insets.top} />}
      >
        {/* 0 · map + header */}
        <View>
          <View style={s.mapClip}>
            <TripMap stops={stops} overview={overview} phase={phase} height={MAP_H} padding={{ top: insets.top + 24, bottom: 60 }} />
          </View>
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
            <TripHeader trip={trip} phase={phase} f={f}>
              <View style={s.actions}>
                {actions.map((a) => (
                  <TouchableOpacity key={a.key} style={s.action} disabled={!a.onPress} onPress={() => { tap(); a.onPress?.(); }} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel={a.onPress ? a.label : `${a.label}, ${a.off}`} accessibilityState={{ disabled: !a.onPress }}>
                    <View style={[s.actionIcon, { backgroundColor: a.onPress ? a.bg : '#F4F4F5', borderColor: a.onPress ? a.fg + '33' : 'transparent' }]}>
                      <a.icon size={20} color={a.onPress ? a.fg : '#B4B4BC'} strokeWidth={2.3} />
                    </View>
                    <Text style={[s.actionText, { color: a.onPress ? a.fg : '#A1A1AA' }]} numberOfLines={1}>{a.onPress ? a.label : a.off}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TripHeader>
          </View>
        </View>

        {/* 1 · tabs — scroll with the page; pinned they slid under the status bar and the Back button */}
        <View style={s.tabsWrap}>
          <View style={s.tabs}>
            {tabs.map((t) => {
              const on = t.id === tab;
              return (
                <TouchableOpacity key={t.id} style={[s.tab, on && s.tabOn]} onPress={() => { if (!on) tap(); setTab(t.id); }} activeOpacity={0.8} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>{t.label}</Text>
                  {t.badge ? (
                    <View style={s.badge}><Text style={s.badgeText}>{t.badge}</Text></View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 2 · tab body */}
        <View style={{ paddingHorizontal: 16 }} onLayout={(e) => { tabBodyY.current = e.nativeEvent.layout.y; }}>
          {tab === 'stops' ? (
            <StopsTab
              trip={trip}
              phase={phase}
              updates={updates}
              f={f}
              onOpenPhotos={openPhotos}
              onSendUpdate={(u) => setShare({ type: 'update', update: u })}
              onCheckTimes={() => setCheckingTimes(true)}
              onSetPin={(st) => setPinTarget({ stop: st, label: stopName(st, stops.indexOf(st)) })}
              focusStopId={focusStop}
              onStopLayout={params.stop ? onStopLayout : undefined}
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

      {/* Solid top bar once the map has scrolled away */}
      {pastMap ? (
        <View style={[s.topBar, { height: insets.top + 60, paddingTop: insets.top }]}>
          <Text style={s.topTitle} numberOfLines={1}>{trip.ref_id ?? 'Trip'}</Text>
          <Text style={s.topSub} numberOfLines={1}>{niceName(trip.customer?.name)}</Text>
        </View>
      ) : null}

      {/* Back, floating over the map and content */}
      <TouchableOpacity style={[s.back, { top: insets.top + 8 }]} onPress={() => router.back()} accessibilityLabel="Back">
        <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
      </TouchableOpacity>

      {/* More — top-right over the map, opposite Back */}
      <TouchableOpacity style={[s.back, s.more, { top: insets.top + 8 }]} onPress={() => setSheet('more')} accessibilityLabel="More actions">
        {uploading ? <ActivityIndicator color={INK} /> : <MoreHorizontal size={20} color={INK} strokeWidth={2.4} />}
      </TouchableOpacity>

      {/* Bottom bar — only when the trip has a next step */}
      {next ? (
        <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <TouchableOpacity style={[s.primary, busy && { opacity: 0.7 }]} onPress={advance} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={Colors.white} /> : (
              <>
                <Check size={18} color={Colors.white} strokeWidth={2.6} />
                <Text style={s.primaryText} numberOfLines={1}>{next.label}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Sheets */}
      <ShareSheet target={share} onClose={() => setShare(null)} trip={trip} phase={phase} f={f} position={position} remaining={remaining} trackingUrl={trackingUrl} onNeedTracking={refreshTracking} whatsappApi={whatsappApi} onShared={reload} />
      <MediaViewer
        items={viewer?.items ?? null}
        startIndex={viewer?.index ?? 0}
        title={viewer?.title ?? ''}
        onClose={() => setViewer(null)}
        status={viewer?.update ? sendStatus(viewer.update) : undefined}
        onSend={viewer?.update ? () => { const u = viewer.update!; setViewer(null); setTimeout(() => setShare({ type: 'update', update: u }), 250); } : undefined}
      />
      <PinSheet target={pinTarget} tripId={trip.id} onClose={() => setPinTarget(null)} onSaved={reload} />
      <TripTimesSheet visible={checkingTimes} trip={trip} tz={tz} onClose={() => setCheckingTimes(false)} onDone={reload} />
      <MoreSheet
        visible={sheet === 'more'}
        trip={trip}
        onClose={() => setSheet(null)}
        onEdit={() => router.push({ pathname: '/trip-edit', params: { id: trip.id } })}
        onCancel={cancelTrip}
        onQuick={quick}
        active={phase === 'active'}
        assignment={phase === 'planned' || phase === 'active'}
        tracking={tracking?.enabled && tracking.url ? { sub: trackingSub(tracking.open_count, tracking.last_opened_at), onPress: trackingActions } : null}
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
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: PAGE, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#E9E9EC', paddingHorizontal: 70 },
  topTitle: { fontSize: 16, fontWeight: '700', color: INK },
  topSub: { fontSize: 12, color: MUTED },
  back: { position: 'absolute', left: 14, width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', ...shadow },
  mapBottom: { position: 'absolute', left: 16, right: 16, top: MAP_H - 38 - 14, height: 38, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gpsChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, ...shadow },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsText: { fontSize: 12, fontWeight: '700', color: INK },
  mapBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', ...shadow },
  // The map has a rounded bottom edge; the header card sits just below it.
  sheetTop: { marginTop: 14, paddingHorizontal: 16 },
  mapClip: { height: MAP_H, overflow: 'hidden', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  tabsWrap: { backgroundColor: PAGE, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18 },
  tabs: { flexDirection: 'row', gap: 4, backgroundColor: '#EAEAED', borderRadius: 12, padding: 3 },
  tab: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: 38, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: WA, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: '800' },
  actions: { flexDirection: 'row', paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionIcon: { width: 50, height: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12, fontWeight: '700' },
  tabOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 14, fontWeight: '600', color: MUTED },
  tabTextOn: { color: INK, fontWeight: '700' },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 10,
    backgroundColor: 'rgba(255,255,255,0.98)', borderTopWidth: 1, borderTopColor: '#E9E9EC',
    shadowColor: '#14141E', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: -6 }, elevation: 12,
  },
  more: { left: undefined, right: 14 },
  primary: { flex: 1, height: 52, borderRadius: 16, backgroundColor: ACTION, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 },
  primaryText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
