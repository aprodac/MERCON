/**
 * Every trip runs on this screen (owner 30 Oct: "keep the customer-app workflow
 * as the main one, remove the normal screens"): the stops the office planned,
 * in order, one big card for the next stop, and at each stop 1 to 3 images —
 * photos of the cargo on a MERCON trip (camera first), screenshots of the
 * customer's app on a customer-app trip (gallery first). Sending them records
 * when the truck left the stop. A stop the office
 * didn't plan can be added by the driver ("Not at <stop>? Add a stop"). Each
 * send is a trip-log entry (shared-types tripLog) put on its stop
 * (POST /mobile/trips/:id/log/:entry/stop), so the office sees the stop reached
 * and checks the time off the screenshot. Chosen by the owner on 22 Oct
 * (idea 1 of three) to replace the free-form trip log.
 *
 * A 10 / 12 hours duty (Riyadh to Riyadh) has no stop list: the driver loads
 * and offloads as often as the customer needs. Its screen is one button —
 * send a screenshot, as many times as needed — the sends so far, and Finish
 * duty (owner, 29 Oct). The sends stay off the stops; the office sees each one
 * with its time and place in the Driver's log. Billing stays the duty rate.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, RefreshControl, Linking, Modal, TextInput, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Camera, Check, ChevronRight, Flag, ImagePlus, LocateFixed, MapPin, Navigation, Plus, RotateCcw, X } from 'lucide-react-native';
import { canUndoTripLogEntry, dutyHours, isDutyCategory, tripLogEntries, TRIP_LOG_OPERATION } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { tripService, stopLabel, type MobileTrip, type TripStop } from '@mercon/mobile-shared/lib/trips';
import { getDeviceLocationTag, pickFromGallery, pickManyFromGallery, takePhoto, type CapturedPhoto, type LocationTag } from '@mercon/mobile-shared/lib/camera';
import { formatTime, formatDayTime } from '@mercon/mobile-shared/lib/dates';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { flipInRTL } from '@mercon/mobile-shared/lib/rtl';
import { useTripById } from '../hooks/use-trip-by-id';
import { DelayButton } from '../components/DelayButton';
import { DelayReportModal } from '../components/DelayReportModal';
import { showToast } from '../components/AppToast';

type Doc = NonNullable<MobileTrip['documents']>[number];
type NewStop = { name?: string; stop_type: 'Pickup' | 'Dropoff'; lat?: number; lng?: number };
type Target = { stop_id: string } | { new_stop: NewStop };

interface StopRow {
  stop: TripStop;
  name: string;
  /** "Load" / "Offload", "· return" on a round trip's way back. */
  kind: string;
  /** An offload stop (else a load): picks the colour of its kind label. */
  drop: boolean;
  /** Screenshot sent for this stop — the stop is ticked. */
  done: boolean;
  /** "Arrived" tapped (or the office set it); from the server so it survives a restart. */
  arrivedAt: string | null;
  doneAt: string | null;
  shots: Doc[];
  /** Added by the driver, not planned by the office. */
  added: boolean;
}

/** A send that didn't go through: kept so one tap retries it (from the first image not uploaded). */
interface Failed { photos: CapturedPhoto[]; sent: number; target: Target | null; entry: string }

/** Images per stop: at least one, at most three. */
const MAX_IMAGES = 3;

/** Load stops green, offload stops blue — the same on the big card and in the list. */
const KIND_LOAD = '#15803D';
const KIND_DROP = '#1D4ED8';

/** A trip planned to start more than this far ahead asks before its first screenshot. */
const EARLY_SEND_MS = 3 * 60 * 60 * 1000;
const newEntryId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const metaOf = (d: Doc) => ((d as { ai_extracted_json?: Record<string, unknown> }).ai_extracted_json ?? {}) as Record<string, unknown>;

function useExternalTrip() {
  const { t } = useLanguage();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const { trip, refetch, setTrip } = useTripById(tripId, { pollMs: 30_000 });
  const [sending, setSending] = useState<string | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [arriving, setArriving] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  /** 10 / 12 hours duty: screenshots only, no stops (see the file comment). */
  const dutyCat = [trip?.rate_category, trip?.quotation_line_type, trip?.trip_type].find((c) => isDutyCategory(c)) ?? null;
  const duty = dutyCat ? { hours: dutyHours(dutyCat) } : null;
  /** A MERCON trip: photos of the cargo, camera first. A customer-app trip: screenshots, gallery first. */
  const photoMode = trip?.driver_workflow !== 'EXTERNAL_APP';

  const entries = useMemo(() => tripLogEntries<Doc>(trip?.documents ?? []), [trip?.documents]);
  const rows = useMemo<StopRow[]>(() => {
    const stops = [...(trip?.stops ?? [])].sort((a, b) => a.stop_sequence - b.stop_sequence);
    return stops.map((st) => {
      const mine = entries.filter((e) => e.stop_id === st.id);
      const shots = mine.flatMap((e) => e.docs);
      const drop = /drop|deliver/i.test(st.stop_type);
      return {
        stop: st,
        name: stopLabel(st) ?? t('label_stop', 'Stop'),
        kind: `${drop ? t('ext_dropoff', 'Offload') : t('ext_loading', 'Load')}${(st.leg_index ?? 0) === 1 ? ` · ${t('ext_return', 'return')}` : ''}`,
        drop,
        done: mine.length > 0,
        arrivedAt: st.actual_arrival ?? null,
        doneAt: st.actual_arrival ?? mine[0]?.at ?? null,
        shots,
        added: shots.some((d) => metaOf(d).added_by_driver === true),
      };
    });
  }, [trip?.stops, entries, t]);
  // The stop after the furthest one done — the driver may have skipped one.
  const lastDone = rows.reduce((n, r, i) => (r.done ? i : n), -1);
  const next = lastDone + 1 < rows.length ? lastDone + 1 : -1;
  /** Sends not on any stop yet (older app, or the stop step failed). */
  const loose = entries.filter((e) => !e.stop_id);

  /** Upload a stop's images as one send, then put it on its stop. True when it all went through. */
  const deliver = async (f: Failed, label: string): Promise<boolean> => {
    if (!trip) return false;
    setSending(label);
    setFailed(null);
    try {
      for (; f.sent < f.photos.length; f.sent++) {
        const photo = f.photos[f.sent];
        const place = photo.location?.city ?? null;
        await tripService.uploadPhoto(trip.id, 'cargo', photo, undefined, TRIP_LOG_OPERATION, undefined, undefined, { entry: f.entry, place });
      }
      if (f.target) setTrip(await tripService.placeTripLogEntry(trip.id, f.entry, f.target));
      else await refetch();
      showToast(photoMode && !duty ? t('ext_photos_sent', 'Photos sent') : t('ext_sent', 'Screenshot sent'), 'success');
      return true;
    } catch (e) {
      setFailed(f);
      showToast(getApiErrorMessage(e), 'error');
      return false;
    } finally {
      setSending(null);
    }
  };

  /**
   * The trip's first send while it is still hours away: ask first. Drivers
   * finished yesterday's trip early and sent its last screenshots on today's
   * (TestFlight 21 Oct, TRP-0048 planned 18:00 got the night's screenshots).
   */
  const rightTrip = (): Promise<boolean> => {
    const plannedStart = trip?.planned_start ?? rows[0]?.stop.planned_arrival ?? null;
    const startMs = plannedStart ? Date.parse(plannedStart) : NaN;
    if (entries.length > 0 || rows.some((r) => r.done) || !(startMs - Date.now() > EARLY_SEND_MS)) return Promise.resolve(true);
    return new Promise((resolve) => {
      Alert.alert(
        t('ext_early_title', 'Is this the right trip?'),
        `${t('ext_early_body', 'This trip is planned for')} ${formatDayTime(plannedStart)}. ${t('ext_early_hint', 'A screenshot from an earlier trip goes on that trip, not this one.')}`,
        [
          { text: t('action_cancel', 'Cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('ext_early_send', 'Send here'), onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  };

  /** Send `photos` (or one screenshot picked now — the duty button) to `target` (null: placed later). */
  const sendTo = async (target: Target | null, label: string, photos?: CapturedPhoto[]): Promise<boolean> => {
    if (!(await rightTrip())) return false;
    const shots = photos ?? [await pickFromGallery()].filter((p): p is CapturedPhoto => !!p);
    if (!shots.length) return false;
    return deliver({ photos: shots, sent: 0, target, entry: newEntryId() }, label);
  };

  /** "Arrived" at a stop: the server stamps the time once; the answer is the trip with it. */
  const arrive = async (stopId: string) => {
    if (!trip || arriving) return;
    setArriving(stopId);
    try {
      const loc = await getDeviceLocationTag().catch(() => null);
      setTrip(await tripService.arriveAtTripLogStop(trip.id, stopId, loc ? { lat: loc.latitude, lng: loc.longitude } : undefined));
    } catch (e) {
      showToast(getApiErrorMessage(e), 'error');
    } finally {
      setArriving(null);
    }
  };

  const place = async (entry: string, target: Target) => {
    if (!trip) return;
    try {
      setTrip(await tripService.placeTripLogEntry(trip.id, entry, target));
    } catch (e) {
      showToast(getApiErrorMessage(e), 'error');
    }
  };

  /** Take back a duty screenshot sent by mistake (the server allows it for a short while). */
  const remove = (entry: string) => {
    if (!trip || removing) return;
    Alert.alert(t('duty_remove_title', 'Remove this screenshot?'), t('duty_remove_body', 'Only if it was sent by mistake.'), [
      { text: t('action_cancel', 'Cancel'), style: 'cancel' },
      {
        text: t('duty_remove', 'Remove'),
        style: 'destructive',
        onPress: async () => {
          setRemoving(entry);
          try {
            await tripService.undoTripLogEntry(trip.id, entry);
            await refetch();
            showToast(t('duty_removed', 'Screenshot removed'), 'success');
          } catch (e) {
            showToast(getApiErrorMessage(e), 'error');
          } finally {
            setRemoving(null);
          }
        },
      },
    ]);
  };

  const complete = async () => {
    if (!trip) return;
    setFinishing(true);
    try {
      setTrip(await tripService.updateStatus(trip.id, 'Completed', 'COMPLETED', undefined, undefined, trip.id));
      router.replace({ pathname: '/trip/completed', params: { tripId: trip.id } } as any);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setFinishing(false);
    }
  };

  const finish = () => {
    if (!trip) return;
    if (sending) return showToast(t('tlog_wait_uploads', 'Wait until all screenshots are sent.'), 'error');
    if (failed) return showToast(t('tlog_failed', 'Not sent. Tap to try again'), 'error');
    if (entries.length === 0) {
      return showToast(duty ? t('duty_finish_first', 'Send at least one screenshot, then you can finish.') : photoMode ? t('ext_finish_empty_photos', 'Send the photos of at least one stop before finishing.') : t('tlog_finish_empty', 'Send at least one screenshot before finishing.'), 'error');
    }
    if (duty) {
      Alert.alert(
        `${t('duty_finish', 'Finish duty')} ${trip.ref_id ?? ''}`.trim(),
        `${entries.length} ${t('duty_finish_confirm', 'screenshots sent. Finish this duty? You cannot send more after this.')}`,
        [
          { text: t('action_cancel', 'Cancel'), style: 'cancel' },
          { text: t('duty_finish', 'Finish duty'), onPress: () => void complete() },
        ],
      );
      return;
    }
    const left = rows.filter((r) => !r.done).map((r) => r.name);
    const names = rows.map((r) => r.name);
    const which = [
      trip.ref_id,
      names.length > 1 ? `${names[0]} → ${names[names.length - 1]}` : names[0],
      trip.planned_start ? formatDayTime(trip.planned_start) : null,
    ].filter(Boolean).join(' · ');
    Alert.alert(
      `${t('tlog_finish', 'Finish trip')} ${which}`,
      left.length
        ? `${photoMode ? t('ext_finish_left_photos', 'No photos yet for') : t('ext_finish_left', 'No screenshot yet for')}: ${left.join(', ')}. ${t('ext_finish_anyway', 'Finish anyway?')}`
        : photoMode ? t('ext_finish_confirm_photos', 'Every stop has its photos. Finish this trip?') : t('ext_finish_confirm', 'All stops have a screenshot. Finish this trip?'),
      [
        { text: t('action_cancel', 'Cancel'), style: 'cancel' },
        { text: t('tlog_finish', 'Finish trip'), onPress: () => void complete() },
      ],
    );
  };

  return { trip, refetch, duty, photoMode, entries, rows, next, loose, sending, arriving, removing, failed, finishing, arrive, sendTo, deliver, place, remove, finish };
}

type Model = ReturnType<typeof useExternalTrip>;

export default function ExternalTripScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const m = useExternalTrip();
  const [delayOpen, setDelayOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  // A stop the driver added: it becomes the card (Here now), sent with its images like any stop.
  // The images are taken from the card, not from the sheet — iOS won't open the photo picker
  // while a Modal is still sliding away (TestFlight #5432).
  const [newStop, setNewStop] = useState<NewStop | null>(null);

  if (!m.trip) {
    return (
      <SafeAreaView style={[s.page, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.primary} />
      </SafeAreaView>
    );
  }
  const trip = m.trip;
  const doneCount = m.rows.filter((r) => r.done).length;
  const addStop = (stop: NewStop) => {
    setNewStop(stop);
    setAdding(false);
  };
  const duty = m.duty;
  const ready = duty ? m.entries.length > 0 && !m.sending : m.next < 0 && m.rows.length > 0;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.page, { backgroundColor: Colors.primary }]}>
      <View style={s.band}>
        <View style={s.topRow}>
          <TouchableOpacity style={s.backBtn} activeOpacity={0.8} onPress={() => router.back()} accessibilityLabel={t('action_back', 'Back')}>
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.4} style={flipInRTL} />
          </TouchableOpacity>
          <DelayButton onPress={() => setDelayOpen(true)} />
        </View>
        <Text style={s.title} numberOfLines={1}>{trip.customer?.name ?? t('tlog_title', 'Trip log')}</Text>
        <Text style={s.sub} numberOfLines={1}>
          {duty
            ? [trip.ref_id, `${m.entries.length} ${t('duty_sent', 'screenshots sent')}`].filter(Boolean).join(' · ')
            : [trip.ref_id, m.rows.length ? `${doneCount} ${t('ext_of', 'of')} ${m.rows.length} ${t('ext_stops_done', 'stops done')}` : null].filter(Boolean).join(' · ')}
        </Text>
        {duty ? null : (
          <View style={s.bar}>
            {m.rows.map((r, i) => <View key={r.stop.id} style={[s.barSeg, r.done && s.barDone, i === m.next && s.barNext]} />)}
          </View>
        )}
      </View>

      <ScrollView
        style={s.body}
        contentContainerStyle={{ padding: 16, paddingBottom: 150, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await m.refetch(); setRefreshing(false); }} />}
      >
        {m.failed ? (
          <TouchableOpacity style={s.failed} onPress={() => void m.deliver(m.failed!, '')} activeOpacity={0.85}>
            <RotateCcw size={16} color="#B42318" />
            <Text style={s.failedText}>{t('tlog_failed', 'Not sent. Tap to try again')}</Text>
          </TouchableOpacity>
        ) : null}
        {duty ? <DutyView m={m} /> : <NextStopView m={m} newStop={newStop} onCancelNew={() => setNewStop(null)} onAdd={() => setAdding(true)} />}
        {!duty && m.loose.length ? <LooseSends m={m} /> : null}
      </ScrollView>

      <View style={s.footer}>
        {duty && m.entries.length === 0 ? (
          <Text style={s.hint}>{t('duty_finish_first', 'Send at least one screenshot, then you can finish.')}</Text>
        ) : null}
        {!duty && m.next < 0 && m.rows.length > 0 ? (
          <Text style={s.hint}>{m.photoMode ? t('ext_all_done_photos', 'Every stop has its photos. Finish the trip when you are done.') : t('ext_all_done', 'Every stop has its screenshot. Finish the trip when you are done.')}</Text>
        ) : null}
        <TouchableOpacity style={[s.finishBtn, ready && s.finishReady]} activeOpacity={0.85} onPress={m.finish} disabled={m.finishing}>
          {m.finishing ? <ActivityIndicator color={Colors.gray900} /> : <Flag size={18} color={ready ? '#fff' : Colors.gray900} />}
          <Text style={[s.finishText, ready && { color: '#fff' }]}>{duty ? t('duty_finish', 'Finish duty') : t('tlog_finish', 'Finish trip')}</Text>
        </TouchableOpacity>
      </View>

      <AddStopSheet visible={adding} onClose={() => setAdding(false)} onAdd={addStop} />
      <DelayReportModal visible={delayOpen} tripId={trip.id} onClose={() => setDelayOpen(false)} onSuccess={() => setDelayOpen(false)} />
    </SafeAreaView>
  );
}

/**
 * The next stop big — Arrived, then 1 to 3 images and Send — then every stop as
 * a short list. A stop the driver just added takes the card until it is sent.
 */
function NextStopView({ m, newStop, onCancelNew, onAdd }: { m: Model; newStop: NewStop | null; onCancelNew: () => void; onAdd: () => void }) {
  const { t } = useLanguage();
  const r = m.next >= 0 ? m.rows[m.next] : null;
  const [tray, setTray] = useState<CapturedPhoto[]>([]);
  // A new card (next stop, or an added one) starts with an empty tray.
  const cardKey = newStop ? `new:${newStop.name ?? ''}:${newStop.stop_type}` : r?.stop.id ?? 'none';
  const [trayFor, setTrayFor] = useState(cardKey);
  if (trayFor !== cardKey) {
    setTrayFor(cardKey);
    setTray([]);
  }
  const add = async (alt: boolean) => {
    const room = MAX_IMAGES - tray.length;
    if (room <= 0) return;
    try {
      // MERCON trip: the camera (gallery as the other way); customer app: the gallery, several at once.
      const fromGallery = m.photoMode ? alt : !alt;
      const picked = fromGallery ? await pickManyFromGallery() : [await takePhoto()].filter((p): p is CapturedPhoto => !!p);
      if (picked.length) setTray((cur) => [...cur, ...picked].slice(0, MAX_IMAGES));
    } catch (e) {
      showToast(getApiErrorMessage(e), 'error');
    }
  };
  const nounOne = m.photoMode ? t('ext_photo', 'photo') : t('ext_screenshot', 'screenshot');
  const nounMany = m.photoMode ? t('ext_photos', 'photos') : t('ext_screenshots', 'screenshots');
  const send = async (target: Target, label: string) => {
    if (await m.sendTo(target, label, tray)) {
      setTray([]);
      if ('new_stop' in target) onCancelNew();
    }
  };

  const card = newStop
    ? { name: newStop.name || t('ext_new_stop_short', 'New stop'), drop: newStop.stop_type === 'Dropoff', arrived: true, eyebrow: t('ext_added_stop', 'Stop you added'), target: { new_stop: newStop } as Target }
    : r ? { name: r.name, drop: r.drop, arrived: !!r.arrivedAt, eyebrow: `${t('ext_stop', 'Stop')} ${m.next + 1} ${t('ext_of', 'of')} ${m.rows.length}`, target: { stop_id: r.stop.id } as Target }
    : null;
  const kindText = newStop ? (newStop.stop_type === 'Dropoff' ? t('ext_dropoff', 'Offload') : t('ext_loading', 'Load')) : r?.kind ?? '';

  return (
    <>
      {card ? (
        <View style={s.nextCard}>
          {/* TestFlight 29 Oct: "make the load and offload highlighted". */}
          <View style={s.eyebrowRow}>
            <Text style={s.eyebrow}>{card.eyebrow}</Text>
            <View style={[s.kindPill, card.drop ? s.kindPillDrop : s.kindPillLoad]}>
              <Text style={s.kindPillText}>{kindText}</Text>
            </View>
          </View>
          <Text style={s.nextName} numberOfLines={2}>{card.name}</Text>
          {newStop ? (
            <Text style={s.nextWhen}>{t('ext_added_here', 'You are here now · the office sees it on the trip')}</Text>
          ) : r ? (
            <TouchableOpacity
              style={[s.arriveBtn, r.arrivedAt && s.bigOff]}
              activeOpacity={1}
              disabled={!!r.arrivedAt || !!m.arriving}
              onPress={() => void m.arrive(r.stop.id)}
            >
              {m.arriving === r.stop.id ? <ActivityIndicator color="#fff" /> : null}
              <Text style={s.arriveText}>
                {r.arrivedAt ? `✓ ${t('ext_arrived_time', 'Arrived')} ${formatTime(r.arrivedAt)}` : `📍 ${t('ext_arrived_at', 'Arrived at')} ${r.name}`}
              </Text>
            </TouchableOpacity>
          ) : null}
          {card.arrived ? (
            <>
              <Text style={[s.eyebrow, { marginTop: 12 }]}>
                {`${m.photoMode ? t('ext_proof_photos', 'Photos of the cargo') : t('ext_proof_shots', 'Screenshot of the customer app')} · ${t('ext_one_to_three', '1 to 3')}`}
              </Text>
              <ProofTray
                photos={tray}
                photoMode={m.photoMode}
                disabled={!!m.sending}
                onAdd={() => void add(false)}
                onAlt={() => void add(true)}
                onRemove={(i) => setTray((cur) => cur.filter((_, k) => k !== i))}
              />
            </>
          ) : null}
          <TouchableOpacity
            style={[s.bigBtn, (!card.arrived || tray.length === 0) && s.bigOff]}
            activeOpacity={0.85}
            disabled={!card.arrived || tray.length === 0 || !!m.sending}
            onPress={() => void send(card.target, card.name)}
          >
            {m.sending ? <ActivityIndicator color="#fff" /> : <Camera size={22} color="#fff" strokeWidth={2.4} />}
            <Text style={s.bigText}>
              {m.sending
                ? t('tlog_sending', 'Sending…')
                : tray.length
                  ? `${t('ext_send', 'Send')} ${tray.length} ${tray.length === 1 ? nounOne : nounMany}`
                  : `${t('ext_send', 'Send')} ${nounMany} ${t('ext_at', 'at')} ${card.name}`}
            </Text>
          </TouchableOpacity>
          <Text style={s.oneShot}>
            {!card.arrived
              ? t('ext_tap_arrived_first', "Tap 'Arrived' first")
              : tray.length
                ? t('ext_send_when_done', 'Send when the work here is done — it records when you left.')
                : `${t('ext_add_first', 'Add at least 1')} ${nounOne}${m.photoMode ? '' : ` ${t('ext_of_customer_app', 'of the customer app')}`}.`}
          </Text>
          {newStop ? (
            <TouchableOpacity onPress={onCancelNew} style={{ alignSelf: 'center', padding: 4 }} hitSlop={8}>
              <Text style={s.removeText}>{t('ext_remove_added', 'Remove this stop')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {r && !newStop ? (
        <TouchableOpacity style={s.dirLink} onPress={() => openMaps(r.stop)} activeOpacity={0.8}>
          <Navigation size={14} color={Colors.gray500} />
          <Text style={s.dirLinkText}>{t('ext_directions', 'Directions')}</Text>
        </TouchableOpacity>
      ) : null}
      {m.rows.length === 0 && !newStop ? (
        // No stops planned (the office didn't know them at booking): the driver adds each one.
        <View style={s.nextCard}>
          <Text style={s.eyebrow}>{t('ext_no_stops', 'No stops planned yet')}</Text>
          <Text style={s.nextWhen}>{t('ext_no_stops_hint_any', 'At each place, add the stop you are at and send its images.')}</Text>
          <TouchableOpacity style={s.bigBtn} activeOpacity={0.85} onPress={onAdd} disabled={!!m.sending}>
            <Plus size={22} color="#fff" strokeWidth={2.6} />
            <Text style={s.bigText}>{t('ext_add_stop_here', 'Add the stop you are at')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {m.rows.length && !newStop ? (
        // A clear card, not a link (owner 30 Oct: "let it be a better view").
        <TouchableOpacity style={s.addCard} onPress={onAdd} activeOpacity={0.85} accessibilityRole="button">
          <View style={s.addIcon}><MapPin size={20} color={Colors.primary} strokeWidth={2.4} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.addTitle} numberOfLines={1}>{r ? `${t('ext_not_at', 'Not at')} ${r.name}?` : t('ext_somewhere_else', 'Somewhere else?')}</Text>
            <Text style={s.addSub}>{t('ext_add_stop_card', 'Add the place you are at — a stop the office didn’t plan')}</Text>
          </View>
          <ChevronRight size={20} color={Colors.gray400} />
        </TouchableOpacity>
      ) : null}
      {m.rows.length ? <View style={s.listCard}>
        {m.rows.map((row, i) => (
          <View key={row.stop.id} style={[s.miniRow, i > 0 && s.rowBorder]}>
            <Bubble done={row.done} next={i === m.next} n={i + 1} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.miniName, i === m.next && { fontWeight: '800' }]} numberOfLines={1}>{row.name}</Text>
              <Text style={s.miniSub} numberOfLines={1}>
                <Text style={[s.miniKind, { color: row.drop ? KIND_DROP : KIND_LOAD }]}>{row.kind}</Text>
                {row.added ? ` · ${t('ext_added_by_you', 'added by you')}` : ''}
                {row.done && row.shots.length ? ` · ${row.shots.length} ${row.shots.length === 1 ? nounOne : nounMany}` : ''}
              </Text>
            </View>
            <Text style={[s.miniTime, row.done && { color: '#15803D' }]}>
              {row.done && row.doneAt
                ? [formatTime(row.doneAt), row.stop.actual_departure ? formatTime(row.stop.actual_departure) : null].filter(Boolean).join(' → ')
                : i === m.next ? (row.arrivedAt ? t('ext_here', 'Here') : t('tlog_next', 'Next')) : ''}
            </Text>
          </View>
        ))}
      </View> : null}
    </>
  );
}

/** Up to three images for the stop: the next empty slot adds one, ✕ takes one out. */
function ProofTray({ photos, photoMode, disabled, onAdd, onAlt, onRemove }: {
  photos: CapturedPhoto[]; photoMode: boolean; disabled: boolean; onAdd: () => void; onAlt: () => void; onRemove: (i: number) => void;
}) {
  const { t } = useLanguage();
  return (
    <>
      <View style={s.tray}>
        {Array.from({ length: MAX_IMAGES }, (_, i) => {
          const p = photos[i];
          if (p) {
            return (
              <View key={i} style={s.slot}>
                <Image source={{ uri: p.uri }} style={s.slotImg} />
                <TouchableOpacity style={s.slotX} onPress={() => onRemove(i)} hitSlop={8} disabled={disabled} accessibilityLabel={t('action_remove', 'Remove')}>
                  <X size={12} color="#fff" strokeWidth={3} />
                </TouchableOpacity>
              </View>
            );
          }
          const nextSlot = i === photos.length;
          return (
            <TouchableOpacity key={i} style={[s.slot, s.slotEmpty, nextSlot && s.slotNext]} disabled={!nextSlot || disabled} onPress={onAdd} activeOpacity={0.8}>
              {nextSlot ? (photoMode ? <Camera size={20} color={Colors.primary} /> : <ImagePlus size={20} color={Colors.primary} />) : <Plus size={16} color={Colors.gray300} />}
              {nextSlot ? <Text style={s.slotText}>{photoMode ? t('ext_take_photo', 'Take photo') : t('ext_add_screenshot', 'Add screenshot')}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {photos.length < MAX_IMAGES ? (
        <TouchableOpacity onPress={onAlt} disabled={disabled} style={{ alignSelf: 'center', paddingVertical: 2 }} hitSlop={6}>
          <Text style={s.altLink}>{photoMode ? t('ext_or_gallery', 'or choose from gallery') : t('ext_or_camera', 'or take a photo')}</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

/**
 * A 10 / 12 hours duty: one big "Send screenshot" (as often as needed), then
 * what was sent, newest on top. No stops to choose from — drivers found a list
 * of options confusing.
 */
function DutyView({ m }: { m: Model }) {
  const { t } = useLanguage();
  const trip = m.trip!;
  const stops = [...(trip.stops ?? [])].sort((a, b) => a.stop_sequence - b.stop_sequence);
  const city = (stops[0] ? stopLabel(stops[0]) : null) ?? trip.origin ?? null;
  const sent = [...m.entries].reverse();
  const n = m.entries.length;
  return (
    <>
      <View style={s.nextCard}>
        <Text style={s.eyebrow} numberOfLines={1}>
          {[m.duty?.hours ? `${m.duty.hours} ${t('duty_hours', 'hours duty')}` : t('duty_hours', 'hours duty'), city].filter(Boolean).join(' · ')}
        </Text>
        <Text style={s.dutyTitle}>{t('duty_title', 'Each time you load or offload, send a screenshot')}</Text>
        <TouchableOpacity
          style={[s.bigBtn, (!!m.sending || m.finishing) && s.bigOff]}
          activeOpacity={0.85}
          disabled={!!m.sending || m.finishing}
          onPress={() => void m.sendTo(null, `#${n + 1}`)}
        >
          {m.sending ? <ActivityIndicator color="#fff" /> : <Camera size={22} color="#fff" strokeWidth={2.4} />}
          <Text style={s.bigText}>{m.sending ? t('tlog_sending', 'Sending…') : t('duty_send', 'Send screenshot')}</Text>
        </TouchableOpacity>
        <Text style={s.oneShot}>{t('duty_hint', 'Send as many as you need. When the duty is over, tap Finish duty.')}</Text>
      </View>

      <View style={s.listCard}>
        <Text style={[s.eyebrow, { paddingTop: 6 }]}>{`${t('duty_list', 'Sent on this duty')} · ${n}`}</Text>
        {n === 0 ? <Text style={[s.miniSub, { paddingVertical: 10 }]}>{t('duty_none', 'Nothing sent yet')}</Text> : null}
        {sent.map((e, i) => (
          <View key={e.id} style={[s.miniRow, i > 0 && s.rowBorder]}>
            <Bubble done next={false} n={n - i} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.miniName} numberOfLines={1}>{`#${n - i} · ${formatTime(e.at)}`}</Text>
              {e.place ? <Text style={s.miniSub} numberOfLines={1}>{e.place}</Text> : null}
            </View>
            {canUndoTripLogEntry(e) && !m.finishing ? (
              <TouchableOpacity onPress={() => m.remove(e.id)} disabled={!!m.removing} hitSlop={8}>
                {m.removing === e.id ? <ActivityIndicator size="small" color={Colors.gray500} /> : <Text style={s.removeText}>{t('duty_remove', 'Remove')}</Text>}
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>
    </>
  );
}

/** Sends not on a stop yet — tap a stop to put them there. */
function LooseSends({ m }: { m: Model }) {
  const { t } = useLanguage();
  const open = m.rows.filter((r) => !r.done);
  return (
    <View style={s.listCard}>
      <Text style={s.eyebrow}>{t('ext_loose', 'Sent, not on a stop yet')}</Text>
      {m.loose.map((e) => (
        <View key={e.id} style={{ gap: 8, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MapPin size={13} color={Colors.gray500} />
            <Text style={s.miniSub}>{[formatTime(e.at), e.place].filter(Boolean).join(' · ')}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {open.map((r) => (
              <TouchableOpacity key={r.stop.id} style={s.chip} onPress={() => void m.place(e.id, { stop_id: r.stop.id })}>
                <Text style={s.chipText}>{r.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * A stop the office didn't plan. Where the phone is now is found when the sheet
 * opens and saved as the stop's pin; the name is optional — left empty, the
 * town the phone is in is used (TestFlight 22 Oct: "saving without typing a
 * name should be possible, using the current location").
 */
function AddStopSheet({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (stop: NewStop) => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [type, setType] = useState<'Pickup' | 'Dropoff'>('Dropoff');
  const [loc, setLoc] = useState<LocationTag | null>(null);
  const [locating, setLocating] = useState(false);
  const [shownFor, setShownFor] = useState(false);
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) {
      setName(''); setType('Dropoff'); setLoc(null); setLocating(true);
      getDeviceLocationTag().then(setLoc).catch(() => setLoc(null)).finally(() => setLocating(false));
    }
  }
  const where = loc ? loc.address || loc.city || `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` : null;
  const save = () => onAdd({
    name: name.trim() || loc?.city || undefined,
    stop_type: type,
    ...(loc ? { lat: loc.latitude, lng: loc.longitude } : {}),
  });
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{t('ext_add_stop', 'Add a stop')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><X size={20} color={Colors.gray500} /></TouchableOpacity>
          </View>
          <Text style={s.miniSub}>{t('ext_add_stop_sub', 'A stop the office did not plan. The office sees it on the trip.')}</Text>
          <View style={s.locRow}>
            {locating ? <ActivityIndicator size="small" color={Colors.primary} /> : <LocateFixed size={18} color={loc ? '#15803D' : Colors.gray400} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.locTitle}>{t('ext_your_location', 'Your location')}</Text>
              <Text style={s.miniSub} numberOfLines={2}>
                {locating ? t('ext_finding_location', 'Finding where you are…') : where ?? t('ext_no_location_any', 'Location not available — the images\' place is used')}
              </Text>
            </View>
          </View>
          <Text style={s.label}>{t('ext_place_optional', 'Name (optional)')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={loc?.city ? `${t('ext_place_default', 'Leave empty to use')} ${loc.city}` : t('ext_place_hint', 'e.g. Taif, Majzuah')}
            placeholderTextColor={Colors.gray400}
            style={s.input}
          />
          <Text style={s.label}>{t('ext_what', 'What happens here')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([['Pickup', t('ext_loading', 'Load')], ['Dropoff', t('ext_dropoff', 'Offload')]] as const).map(([v, label]) => (
              <TouchableOpacity key={v} style={[s.seg, type === v && s.segOn]} onPress={() => setType(v)} activeOpacity={0.8}>
                <Text style={[s.segText, type === v && { color: '#fff' }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[s.bigBtn, locating && { opacity: 0.6 }]} disabled={locating} onPress={save} activeOpacity={0.85}>
            <MapPin size={20} color="#fff" />
            <Text style={s.bigText}>{t('ext_add_stop_btn', 'Add this stop')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Bubble({ done, next, n }: { done: boolean; next: boolean; n: number }) {
  return (
    <View style={[s.bubble, done ? s.bubbleDone : next ? s.bubbleNext : null]}>
      {done ? <Check size={13} color="#fff" strokeWidth={3} /> : <Text style={[s.bubbleText, next && { color: '#fff' }]}>{n}</Text>}
    </View>
  );
}

function openMaps(st: TripStop) {
  if (!Number.isFinite(st.location_lat) || !(st.location_lat || st.location_lng)) return;
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${st.location_lat},${st.location_lng}`).catch(() => {});
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.gray100 },
  band: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  sub: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  bar: { flexDirection: 'row', gap: 4, marginTop: 12 },
  barSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  barDone: { backgroundColor: '#22C55E' },
  barNext: { backgroundColor: '#fff' },
  body: { flex: 1, backgroundColor: Colors.gray100, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  failed: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3F2', borderWidth: 1, borderColor: '#FDA29B', borderRadius: 14, padding: 12 },
  failedText: { fontSize: 14, fontWeight: '700', color: '#B42318' },
  nextCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, gap: 6 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: Colors.gray500, textTransform: 'uppercase' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  kindPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  kindPillLoad: { backgroundColor: KIND_LOAD },
  kindPillDrop: { backgroundColor: KIND_DROP },
  kindPillText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, color: '#fff', textTransform: 'uppercase' },
  nextName: { fontSize: 28, fontWeight: '800', color: Colors.gray900 },
  nextWhen: { fontSize: 14, color: Colors.gray500, fontWeight: '600' },
  arriveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#16A34A', borderRadius: 18, paddingVertical: 18, paddingHorizontal: 12, marginTop: 10 },
  arriveText: { color: '#fff', fontSize: 19, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  bigOff: { backgroundColor: Colors.gray300 },
  dirLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  dirLinkText: { fontSize: 13, fontWeight: '700', color: Colors.gray500 },
  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 12, marginTop: 10 },
  bigText: { color: '#fff', fontSize: 17, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  dutyTitle: { fontSize: 22, fontWeight: '800', color: Colors.gray900, marginTop: 2 },
  removeText: { fontSize: 13, fontWeight: '800', color: '#B42318' },
  oneShot: { fontSize: 12.5, color: Colors.gray500, textAlign: 'center', marginTop: 4 },
  addCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 18, padding: 14, borderWidth: 1.5, borderColor: '#FBD3C9', borderStyle: 'dashed' },
  addIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF1EC', alignItems: 'center', justifyContent: 'center' },
  addTitle: { fontSize: 16, fontWeight: '800', color: Colors.gray900 },
  addSub: { fontSize: 12.5, color: Colors.gray500, marginTop: 2 },
  tray: { flexDirection: 'row', gap: 8, marginTop: 4 },
  slot: { flex: 1, aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.gray100 },
  slotImg: { width: '100%', height: '100%' },
  slotX: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  slotEmpty: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.gray300, backgroundColor: '#fff' },
  slotNext: { borderColor: Colors.primary, backgroundColor: '#FFF6F3' },
  slotText: { fontSize: 11.5, fontWeight: '800', color: Colors.primary, textAlign: 'center', paddingHorizontal: 4 },
  altLink: { fontSize: 13, fontWeight: '700', color: Colors.gray500, textDecorationLine: 'underline' },
  listCard: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray200 },
  miniName: { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  miniSub: { fontSize: 12.5, color: Colors.gray500, marginTop: 1 },
  miniKind: { fontWeight: '800' },
  miniTime: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  bubble: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: Colors.gray300, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  bubbleDone: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  bubbleNext: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  bubbleText: { fontSize: 12, fontWeight: '800', color: Colors.gray500 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', padding: 16, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
  hint: { fontSize: 12.5, color: Colors.gray500, textAlign: 'center' },
  finishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gray100, borderRadius: 16, paddingVertical: 13 },
  finishReady: { backgroundColor: '#16A34A' },
  finishText: { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 30, gap: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: Colors.gray900, flex: 1 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.gray100, borderRadius: 12, padding: 12, marginTop: 4 },
  locTitle: { fontSize: 14, fontWeight: '800', color: Colors.gray900 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.gray700, marginTop: 6 },
  input: { borderWidth: 1, borderColor: Colors.gray300, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: Colors.gray900 },
  seg: { flex: 1, alignItems: 'center', borderRadius: 12, paddingVertical: 12, backgroundColor: Colors.gray100 },
  segOn: { backgroundColor: Colors.gray900 },
  segText: { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  chip: { backgroundColor: Colors.gray100, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.gray900 },
});
