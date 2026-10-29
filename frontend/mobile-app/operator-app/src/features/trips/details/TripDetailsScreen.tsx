/**
 * Route: /trip-details?id= — one trip for an operator.
 *
 * Map on top (MapLibre; a running trip opens full screen in the live view,
 * /trip-live, others in a plain full-screen map), then who / where / status,
 * then three tabs:
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
import { ArrowLeft, CalendarClock, Check, LayoutList, Lock, Maximize2, MessageCircle, MoreHorizontal, Navigation, Phone, Route, Send, X, type LucideIcon } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { chooseMedia } from '@mercon/mobile-shared/lib/camera';
import {
  invalidateOperatorTrips, operatorService, type DriverUpdate, type OperatorDriver, type OperatorTripDocument, type OperatorVehicle, type TripDocKind,
} from '../../../lib/operator';
import { PickerSheet, niceName } from '../create/components/ui';
import { useTripDetails } from './useTripDetails';
import { ago, digits, distanceFromStop, hoursText, makeFormatters, mapsLink, metersText, minutesText, nextActionFor, photoPinsForStop, sendStatus, sortedStops, stopName, updateTitle, type PhotoPin, type QuickKind, type Stop } from './tripDetailsModel';
import { needsPin } from './components/StopsTab';
import { TripMap } from './components/TripMap';
import { TripHeader } from './components/TripHeader';
import { StopsTab } from './components/StopsTab';
import { DetailsTab } from './components/DetailsTab';
import { ShareSheet, type ShareTarget } from './components/ShareSheet';
import { MediaViewer, type ViewerItem } from './components/MediaViewer';
import { DriverLog, LogStopSheet, type LogEntry } from './components/DriverLog';
import { TripTimesSheet } from './components/TripTimesSheet';
import { PinSheet } from './components/PinSheet';
import { ActivitySheet, ChargesSheet, MoreSheet, UploadSheet } from './components/Sheets';
import { StepBackSheet } from './components/StepBackSheet';
import { ACTION, INK, MUTED, PAGE, WA, WA_INK, WA_LIGHT, tap } from './components/parts';
import { askDeleteTrip, canDeleteTrip } from '../edit/movePlan';
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
  const { trip, overview, updates, whatsappApi, tz, phase, remaining, tracking, trackingUrl, refreshTracking, loading, refreshing, error, deleted, refresh, reload } = useTripDetails(id);
  const f = useMemo(() => makeFormatters(tz), [tz]);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>(params.tab === 'stops' || params.stop || params.photo ? 'stops' : 'details');
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<ShareTarget | null>(null);
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number; title: string; update?: DriverUpdate } | null>(null);
  const [checkingTimes, setCheckingTimes] = useState(false);
  const [timesStop, setTimesStop] = useState<string | null>(null);
  const [logEntry, setLogEntry] = useState<LogEntry | null>(null);
  /** A photo being moved to another stop (the stop picker is open). */
  const [moving, setMoving] = useState<{ docId: string; fromStopId: string | null } | null>(null);
  const [pinTarget, setPinTarget] = useState<{ stop: Stop; label: string; photoPins?: PhotoPin[]; preselect?: string | null } | null>(null);
  const [sheet, setSheet] = useState<'more' | 'upload' | 'activity' | 'charges' | 'stepback' | null>(null);
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
        <Text style={s.errTitle}>{deleted ? 'This trip was deleted' : 'Couldn’t open this trip'}</Text>
        <Text style={s.errText}>{error ?? 'Trip not found'}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <TouchableOpacity style={s.errBtn} onPress={() => router.back()}><Text style={s.errBtnText}>Go back</Text></TouchableOpacity>
          {deleted ? null : <TouchableOpacity style={[s.errBtn, { backgroundColor: ACTION }]} onPress={refresh}><Text style={[s.errBtnText, { color: Colors.white }]}>Retry</Text></TouchableOpacity>}
        </View>
      </View>
    );
  }

  const stops = sortedStops(trip);
  const next = nextActionFor(trip.status);
  // Not started yet and planned for a later day: the status buttons wait for that day
  // (a trip booked for the 28th must not be marked loaded today by mistake).
  const startDay = trip.planned_start ? f.dayKey(trip.planned_start) : null;
  const notYet = !!next && (trip.status === 'Scheduled' || trip.status === 'Loading') && !!startDay && startDay > f.dayKey(new Date().toISOString());
  const position = overview?.unit?.position ? { lat: overview.unit.position.lat, lng: overview.unit.position.lng } : null;
  const gps = overview?.unit?.position;
  const liveView = phase === 'active' && !!gps;
  // The driver has progress the office can take back (not before Start, not once invoiced / cancelled).
  const canStepBack = !!trip && (
    ['Loading', 'InTransit', 'Delayed', 'Completed'].includes(trip.status)
    || (trip.status === 'Scheduled' && !!trip.driver_workflow_state && trip.driver_workflow_state !== 'ASSIGNED')
  );

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

  // Delete: a trip made by mistake (a month plan's other not-started trips can go with it).
  const deleteTrip = () => askDeleteTrip(trip, {
    busy: setBusy,
    deleted: () => {
      invalidateOperatorTrips();
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      router.back();
    },
  });

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

  const applyChange = async (value: string, withDriver?: string) => {
    if (!picker) return;
    setBusy(true);
    try {
      // A trip booked with "Assign later" has no driver to replace: assign one
      // (replace-driver answered "This trip has no driver yet" — TestFlight feedback).
      if (picker.kind === 'driver') {
        if (trip.driver) await operatorService.replaceDriver(trip.id, value);
        else await operatorService.assignTrip(trip.id, { driver_id: value });
      } else if (withDriver) await operatorService.assignTrip(trip.id, { vehicle_id: value, driver_id: withDriver });
      else await operatorService.replaceVehicle(trip.id, value);
      reload();
    } catch (e) {
      Alert.alert(picker.kind === 'driver' ? 'Could not assign the driver' : 'Could not assign the truck', getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** A truck picked for a trip with no driver: offer the truck's own driver too. */
  const pickValue = (value: string) => {
    const truck = picker?.kind === 'truck' ? picker.vehicles?.find((v) => v.id === value) : null;
    const usual = truck?.assignedDriver;
    if (picker?.kind === 'truck' && !trip.driver && !trip.is_third_party && usual?.id) {
      const name = niceName(`${usual.first_name} ${usual.last_name}`);
      Alert.alert('Add the driver too?', `${name} drives ${truck!.plate_number}. Assign them to this trip as well?`, [
        { text: 'Truck only', onPress: () => applyChange(value) },
        { text: `Add ${name}`, onPress: () => applyChange(value, usual.id) },
      ]);
      return;
    }
    applyChange(value);
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


  // A photo, screenshot or video the office adds at one stop (TestFlight 19 Oct: "option to add photo,
  // screenshot and video by the operator") — filed under that stop like the driver's own.
  const uploadAtStop = async (st: { id: string; stop_type: string; leg_index?: number | null }) => {
    try {
      const media = await chooseMedia();
      if (!media) return;
      setUploading(true);
      const drop = /drop|deliver/i.test(st.stop_type);
      const operation = drop ? 'delivery' : (st.leg_index ?? 0) === 1 ? 'return_loading' : /pick/i.test(st.stop_type) ? 'pickup' : 'intermediate';
      await operatorService.uploadTripDocument(trip!.id, { uri: media.uri, name: media.fileName ?? undefined, mimeType: media.mimeType }, drop ? 'POD' : 'Waybill', { stopId: st.id, operation });
      reload();
    } catch (e) {
      Alert.alert('Upload failed', getApiErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  // Undo the "remove photos" of a step-back.
  const undoStepBack = () => {
    Alert.alert('Undo the take-back?', 'The trip goes back to where it was before, with the same times and photos. The driver gets a notification.', [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Undo', onPress: async () => {
          try {
            const r = await operatorService.undoStepBack(trip!.id);
            Alert.alert('Take-back undone', `Now at: ${r.to.label}.`);
            reload();
          } catch (e) {
            Alert.alert('Could not undo', getApiErrorMessage(e));
          }
        },
      },
    ]);
  };

  const restorePhotos = (removedAt: string) => {
    Alert.alert('Restore the photos?', 'They go back onto the stops they were on before.', [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Restore', onPress: async () => {
          try {
            const n = await operatorService.restoreStepBackPhotos(trip!.id, removedAt);
            Alert.alert('Photos restored', `${n} photo${n === 1 ? '' : 's'} back on the trip.`);
            reload();
          } catch (e) {
            Alert.alert('Could not restore', getApiErrorMessage(e));
          }
        },
      },
    ]);
  };

  // Set pin for a stop, offering the driver's geotagged photos there as the pin.
  const openPin = (st: Stop, preselect: string | null = null) =>
    setPinTarget({ stop: st, label: stopName(st, stops.indexOf(st)), photoPins: photoPinsForStop(updates, st.id), preselect });

  // TestFlight 24 Oct: a photo the driver sent by mistake (a trial) can be deleted — after asking.
  const deletePhoto = (docId: string) => {
    Alert.alert('Delete this photo?', 'It is taken off the trip and goes to Recently deleted, where it can be restored. Stop times already saved stay as they are.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await operatorService.deleteTripPhoto(trip!.id, docId);
            setViewer(null);
            reload();
          } catch (e) {
            Alert.alert('Could not delete', getApiErrorMessage(e));
          }
        },
      },
    ]);
  };

  // TestFlight 25 Oct: a screenshot sent at the wrong stop ("Riyadh reached" sent as Al Bahah) can be moved.
  const movePhoto = async (stopId: string) => {
    const m = moving;
    setMoving(null);
    if (!m) return;
    try {
      await operatorService.moveTripPhoto(trip!.id, m.docId, stopId);
      const st = stops.find((x) => x.id === stopId);
      Alert.alert('Photo moved', `It is now on ${st ? stopName(st, stops.indexOf(st)) : 'that stop'}. If the driver's steps went too far, take them back with "Driver's steps", then check the times.`);
      reload();
    } catch (e) {
      Alert.alert('Could not move', getApiErrorMessage(e));
    }
  };
  const askMove = (docId: string, fromStopId: string | null) => { setViewer(null); setTimeout(() => setMoving({ docId, fromStopId }), 300); };

  const externalApp = trip.driver_workflow === 'EXTERNAL_APP';
  const openTimes = (stopId: string | null) => { setViewer(null); setTimeout(() => { setTimesStop(stopId); setCheckingTimes(true); }, 300); };

  const openPhotos = (u: DriverUpdate, index: number) => {
    const st = stops.find((x) => x.id === u.stop?.id);
    const name = st ? stopName(st, stops.indexOf(st)) : null;
    const items = u.items.map((m) => {
      const away = st && m.gps ? distanceFromStop(st, m.gps) : null;
      const late = m.uploaded_at ? (new Date(m.uploaded_at).getTime() - new Date(m.captured_at).getTime()) / 60000 : 0;
      const facts = [
        `Taken ${f.smart(m.captured_at)}`,
        // Uploaded much later than taken: the phone was offline, or it's an old photo.
        m.uploaded_at && late > 5 ? `uploaded ${f.smart(m.uploaded_at)} (${minutesText(late)} later)` : null,
        !m.gps ? 'no GPS on this photo' : st && needsPin(st) ? `${name}'s pin is approximate` : away != null ? `${metersText(away)} from the ${name} pin` : null,
        m.moved_at ? `moved here by the office ${f.smart(m.moved_at)}` : null,
      ].filter(Boolean).join(' · ');
      // A geotagged photo can fix a guessed pin (or one that's clearly off).
      const canPin = !!st && !!m.gps && m.kind !== 'video' && phase !== 'cancelled' && (needsPin(st) || (away != null && away > 300));
      return {
        id: m.id,
        url: m.url,
        kind: m.kind,
        caption: `${updateTitle(u)} · ${f.smart(m.captured_at)}`,
        sent: u.sent_ids.includes(m.id),
        geo: m.gps ? { lat: m.gps.lat, lng: m.gps.lng, captured_at: m.captured_at, place: name, address: st?.location?.city ?? null, customer: trip.customer?.name ?? null } : null,
        info: facts,
        // Times are edited from the photo itself (TestFlight 25 Oct): a stop's own times,
        // or — on a customer-app trip — Check times for the whole trip.
        timeAction: st && (st.actual_arrival || externalApp) ? {
          label: st.actual_arrival ? `Edit ${name}'s time` : `Set ${name}'s time`,
          onPress: () => openTimes(st.id),
        } : externalApp ? { label: 'Check times', onPress: () => openTimes(null) } : null,
        deleteAction: { onPress: () => deletePhoto(m.id) },
        moveAction: stops.length > 1 ? { onPress: () => askMove(m.id, st?.id ?? null) } : null,
        pinAction: canPin ? {
          label: needsPin(st!) ? `Use as ${name}'s pin` : `Move ${name}'s pin here`,
          onPress: () => { setViewer(null); setTimeout(() => openPin(st!, m.id), 300); },
        } : null,
      };
    });
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
        contentContainerStyle={{ paddingBottom: (next ? (notYet ? 150 : 110) : 32) + insets.bottom }}
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
            {liveView ? (
              // A running trip with a truck on GPS: the live map (2D / 3D / Drive / Route, ETA).
              <TouchableOpacity style={s.liveBtn} onPress={() => router.push({ pathname: '/trip-live', params: { id: trip.id } })} accessibilityLabel="Open the live map" activeOpacity={0.85}>
                <Navigation size={14} color={Colors.white} strokeWidth={2.4} />
                <Text style={s.liveBtnText}>Live view</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.mapBtn} onPress={() => setFullMap(true)} accessibilityLabel="Open full-screen map">
                <Maximize2 size={16} color={INK} strokeWidth={2.3} />
              </TouchableOpacity>
            )}
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
            <>
            <DriverLog
              trip={trip}
              f={f}
              onOpen={(e, index) => setViewer({
                title: `Driver's log · ${f.smart(e.at)}`,
                index,
                items: e.docs.map((d) => ({
                  id: d.id, url: d.file_url, kind: 'photo' as const, caption: [f.smart(e.at), e.place ? `near ${e.place}` : null].filter(Boolean).join(' · '),
                  deleteAction: { onPress: () => deletePhoto(d.id) },
                  // On a stop: its times. Not on one yet: put it on a stop, with its times.
                  timeAction: e.stop_id
                    ? { label: 'Edit times', onPress: () => openTimes(e.stop_id) }
                    : { label: 'Put on a stop · set times', onPress: () => { setViewer(null); setTimeout(() => setLogEntry(e), 300); } },
                })),
              })}
              onPick={setLogEntry}
              onDone={reload}
            />
            <StopsTab
              trip={trip}
              phase={phase}
              updates={updates}
              f={f}
              onOpenPhotos={openPhotos}
              onSendUpdate={(u) => setShare({ type: 'update', update: u })}
              onCheckTimes={(stopId) => { setTimesStop(stopId ?? null); setCheckingTimes(true); }}
              onSetPin={(st) => openPin(st)}
              focusStopId={focusStop}
              onStopLayout={params.stop ? onStopLayout : undefined}
              onStepBack={canStepBack ? () => setSheet('stepback') : undefined}
              onRestorePhotos={restorePhotos}
              onUndoStepBack={undoStepBack}
              onAddMedia={uploadAtStop}
            />
            </>
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
      {next && notYet ? (
        <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 4, flexDirection: 'column', gap: 8 }]}>
          <View style={s.waitRow}>
            <Lock size={15} color={MUTED} strokeWidth={2.4} />
            <Text style={s.waitText} numberOfLines={2}>
              {`Planned for ${f.dayTime(trip.planned_start)}. “${next.label}” opens on that day.`}
            </Text>
          </View>
          <TouchableOpacity style={[s.primary, s.primaryQuiet]} onPress={() => router.push({ pathname: '/trip-edit', params: { id: trip.id } })} activeOpacity={0.85} accessibilityRole="button">
            <CalendarClock size={18} color={INK} strokeWidth={2.4} />
            <Text style={[s.primaryText, { color: INK }]} numberOfLines={1}>Running today? Change the date</Text>
          </TouchableOpacity>
        </View>
      ) : next ? (
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
        context={[
          stops.length > 1 ? `${stopName(stops[0], 0)} → ${stopName(stops[stops.length - 1], stops.length - 1)}` : null,
          trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name}`.trim() : trip.third_party_driver_name ?? null,
          trip.vehicle?.plate_number ?? trip.third_party_vehicle_plate ?? null,
        ].filter(Boolean).join(' · ')}
        onClose={() => setViewer(null)}
        status={viewer?.update ? sendStatus(viewer.update) : undefined}
        onSend={viewer?.update ? () => { const u = viewer.update!; setViewer(null); setTimeout(() => setShare({ type: 'update', update: u }), 250); } : undefined}
      />
      <PinSheet target={pinTarget} tripId={trip.id} timeOf={f.time} onClose={() => setPinTarget(null)} onSaved={reload} />
      <LogStopSheet trip={trip} entry={logEntry} f={f} tz={tz} onClose={() => setLogEntry(null)} onDone={reload} />
      <TripTimesSheet visible={checkingTimes} trip={trip} tz={tz} stopId={timesStop} onClose={() => setCheckingTimes(false)} onDone={reload} />
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
        onStepBack={canStepBack ? () => setSheet('stepback') : undefined}
        onDelete={canDeleteTrip(trip.status) ? deleteTrip : undefined}
      />
      <StepBackSheet visible={sheet === 'stepback'} tripId={trip.id} f={f} onClose={() => setSheet(null)} onDone={reload} />
      <UploadSheet visible={sheet === 'upload'} onClose={() => setSheet(null)} onPick={upload} />
      <ActivitySheet visible={sheet === 'activity'} trip={trip} f={f} halts={overview?.halts ?? null} onClose={() => setSheet(null)} />
      <ChargesSheet visible={sheet === 'charges'} trip={trip} onClose={() => setSheet(null)} onSaved={reload} />
      <PickerSheet
        visible={!!picker}
        title={picker?.kind === 'driver' ? (trip.driver ? 'Change driver' : 'Assign driver') : (trip.vehicle ? 'Change truck' : 'Assign truck')}
        options={
          picker?.kind === 'driver'
            ? (picker.drivers ?? []).map((d) => ({ value: d.id, label: niceName(`${d.first_name} ${d.last_name}`), sub: [d.ref_id, d.phone_primary].filter(Boolean).join(' · ') }))
            : (picker?.vehicles ?? []).map((v) => ({ value: v.id, label: v.plate_number, sub: [v.capacity_kg ? `${Math.round(v.capacity_kg / 1000)} ton` : null, v.asset_type].filter(Boolean).join(' · ') }))
        }
        value={picker?.kind === 'driver' ? trip.driver?.id : trip.vehicle?.id}
        onSelect={pickValue}
        onClose={() => setPicker(null)}
        searchPlaceholder={picker?.kind === 'driver' ? 'Search drivers' : 'Search trucks'}
        emptyText={picker?.kind === 'driver' ? 'No drivers available right now' : 'No trucks available right now'}
      />

      <PickerSheet
        visible={!!moving}
        title="Move the photo to"
        options={stops.filter((x) => x.id !== moving?.fromStopId).map((x) => ({
          value: x.id,
          label: `${stops.indexOf(x) + 1} · ${stopName(x, stops.indexOf(x))}`,
          sub: [x.stop_type === 'Pickup' ? 'Loading' : 'Offloading', x.actual_arrival ? `arrived ${f.smart(x.actual_arrival)}` : null].filter(Boolean).join(' · '),
        }))}
        onSelect={(v) => { void movePhoto(v); }}
        onClose={() => setMoving(null)}
        searchPlaceholder="Search stops"
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
  liveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, borderRadius: 19, paddingHorizontal: 14, backgroundColor: INK, ...shadow },
  liveBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },
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
  primaryQuiet: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'stretch', backgroundColor: '#F1F1F3' },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  waitText: { flex: 1, fontSize: 13, fontWeight: '600', color: MUTED },
});
