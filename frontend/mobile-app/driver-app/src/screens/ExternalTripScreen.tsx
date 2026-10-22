/**
 * Customer-app trips (iMile, JD…) the way the normal trip works: the stops the
 * office planned, in order, one big card for the next stop, and at each stop
 * ONE screenshot of the customer's app (not three photos). A stop the office
 * didn't plan can be added by the driver ("Not at <stop>? Add a stop"). Each
 * send is a trip-log entry (shared-types tripLog) put on its stop
 * (POST /mobile/trips/:id/log/:entry/stop), so the office sees the stop reached
 * and checks the time off the screenshot. Chosen by the owner on 22 Oct
 * (idea 1 of three) to replace the free-form trip log.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, RefreshControl, Linking, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Camera, Check, Flag, LocateFixed, MapPin, Navigation, Plus, RotateCcw, X } from 'lucide-react-native';
import { tripLogEntries, TRIP_LOG_OPERATION } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { tripService, stopLabel, type MobileTrip, type TripStop } from '@mercon/mobile-shared/lib/trips';
import { getDeviceLocationTag, pickFromGallery, type CapturedPhoto, type LocationTag } from '@mercon/mobile-shared/lib/camera';
import { formatTime, formatDayTime } from '@mercon/mobile-shared/lib/dates';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { flipInRTL } from '@mercon/mobile-shared/lib/rtl';
import { useCurrentTrip } from '../hooks/use-current-trip';
import { DelayButton } from '../components/DelayButton';
import { DelayReportModal } from '../components/DelayReportModal';
import { showToast } from '../components/AppToast';

type Doc = NonNullable<MobileTrip['documents']>[number];
type NewStop = { name?: string; stop_type: 'Pickup' | 'Dropoff'; lat?: number; lng?: number };
type Target = { stop_id: string } | { new_stop: NewStop };

interface StopRow {
  stop: TripStop;
  name: string;
  /** "Loading" / "Drop-off", "· return" on a round trip's way back. */
  kind: string;
  done: boolean;
  doneAt: string | null;
  shots: Doc[];
  /** Added by the driver, not planned by the office. */
  added: boolean;
}

/** A send that didn't go through: kept so one tap retries it. */
interface Failed { photo: CapturedPhoto; target: Target | null; entry: string; uploaded: boolean }

/** A trip planned to start more than this far ahead asks before its first screenshot. */
const EARLY_SEND_MS = 3 * 60 * 60 * 1000;
const newEntryId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const metaOf = (d: Doc) => ((d as { ai_extracted_json?: Record<string, unknown> }).ai_extracted_json ?? {}) as Record<string, unknown>;

function useExternalTrip() {
  const { t } = useLanguage();
  const router = useRouter();
  const { trip, refetch, setTrip } = useCurrentTrip({ pollMs: 30_000 });
  const [sending, setSending] = useState<string | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [finishing, setFinishing] = useState(false);

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
        kind: `${drop ? t('ext_dropoff', 'Drop-off') : t('ext_loading', 'Loading')}${(st.leg_index ?? 0) === 1 ? ` · ${t('ext_return', 'return')}` : ''}`,
        done: !!st.actual_arrival || mine.length > 0,
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

  /** Upload one screenshot as a send, then put it on its stop. */
  const deliver = async (f: Failed, label: string) => {
    if (!trip) return;
    setSending(label);
    setFailed(null);
    try {
      if (!f.uploaded) {
        const place = f.photo.location?.city ?? null;
        await tripService.uploadPhoto(trip.id, 'cargo', f.photo, undefined, TRIP_LOG_OPERATION, undefined, undefined, { entry: f.entry, place });
        f.uploaded = true;
      }
      if (f.target) setTrip(await tripService.placeTripLogEntry(trip.id, f.entry, f.target));
      else await refetch();
      showToast(t('ext_sent', 'Screenshot sent'), 'success');
    } catch (e) {
      setFailed(f);
      showToast(getApiErrorMessage(e), 'error');
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

  /** Pick the screenshot and send it to `target` (null: just sent, placed later). */
  const sendTo = async (target: Target | null, label: string, photo?: CapturedPhoto | null) => {
    if (!(await rightTrip())) return;
    const shot = photo ?? (await pickFromGallery());
    if (!shot) return;
    await deliver({ photo: shot, target, entry: newEntryId(), uploaded: false }, label);
  };

  const place = async (entry: string, target: Target) => {
    if (!trip) return;
    try {
      setTrip(await tripService.placeTripLogEntry(trip.id, entry, target));
    } catch (e) {
      showToast(getApiErrorMessage(e), 'error');
    }
  };

  const finish = () => {
    if (!trip) return;
    if (sending) return showToast(t('tlog_wait_uploads', 'Wait until all screenshots are sent.'), 'error');
    if (entries.length === 0) return showToast(t('tlog_finish_empty', 'Send at least one screenshot before finishing.'), 'error');
    const left = rows.filter((r) => !r.done).map((r) => r.name);
    Alert.alert(
      t('tlog_finish', 'Finish trip'),
      left.length
        ? `${t('ext_finish_left', 'No screenshot yet for')}: ${left.join(', ')}. ${t('ext_finish_anyway', 'Finish anyway?')}`
        : t('ext_finish_confirm', 'All stops have a screenshot. Finish this trip?'),
      [
        { text: t('action_cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('tlog_finish', 'Finish trip'),
          onPress: async () => {
            setFinishing(true);
            try {
              setTrip(await tripService.updateStatus(trip.id, 'Completed', 'COMPLETED'));
              router.replace({ pathname: '/trip/completed', params: { tripId: trip.id } } as any);
            } catch (err) {
              showToast(getApiErrorMessage(err), 'error');
            } finally {
              setFinishing(false);
            }
          },
        },
      ],
    );
  };

  return { trip, refetch, rows, next, loose, sending, failed, finishing, sendTo, deliver, place, finish };
}

type Model = ReturnType<typeof useExternalTrip>;

export default function ExternalTripScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const m = useExternalTrip();
  const [delayOpen, setDelayOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

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
    setAdding(false);
    void m.sendTo({ new_stop: stop }, stop.name ?? t('ext_new_stop_short', 'New stop'));
  };

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
          {[trip.ref_id, m.rows.length ? `${doneCount} ${t('ext_of', 'of')} ${m.rows.length} ${t('ext_stops_done', 'stops done')}` : null].filter(Boolean).join(' · ')}
        </Text>
        <View style={s.bar}>
          {m.rows.map((r, i) => <View key={r.stop.id} style={[s.barSeg, r.done && s.barDone, i === m.next && s.barNext]} />)}
        </View>
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
        <NextStopView m={m} onAdd={() => setAdding(true)} />
        {m.loose.length ? <LooseSends m={m} /> : null}
      </ScrollView>

      <View style={s.footer}>
        {m.next < 0 && m.rows.length > 0 ? (
          <Text style={s.hint}>{t('ext_all_done', 'Every stop has its screenshot. Finish the trip when you are done.')}</Text>
        ) : null}
        <TouchableOpacity style={[s.finishBtn, m.next < 0 && m.rows.length > 0 && s.finishReady]} activeOpacity={0.85} onPress={m.finish} disabled={m.finishing}>
          {m.finishing ? <ActivityIndicator color={Colors.gray900} /> : <Flag size={18} color={m.next < 0 ? '#fff' : Colors.gray900} />}
          <Text style={[s.finishText, m.next < 0 && m.rows.length > 0 && { color: '#fff' }]}>{t('tlog_finish', 'Finish trip')}</Text>
        </TouchableOpacity>
      </View>

      <AddStopSheet visible={adding} onClose={() => setAdding(false)} onAdd={addStop} />
      <DelayReportModal visible={delayOpen} tripId={trip.id} onClose={() => setDelayOpen(false)} onSuccess={() => setDelayOpen(false)} />
    </SafeAreaView>
  );
}

/** The next stop big with one button, then every stop as a short list. */
function NextStopView({ m, onAdd }: { m: Model; onAdd: () => void }) {
  const { t } = useLanguage();
  const r = m.next >= 0 ? m.rows[m.next] : null;
  return (
    <>
      {r ? (
        <View style={s.nextCard}>
          <Text style={s.eyebrow}>{`${t('ext_stop', 'Stop')} ${m.next + 1} ${t('ext_of', 'of')} ${m.rows.length} · ${r.kind}`}</Text>
          <Text style={s.nextName} numberOfLines={2}>{r.name}</Text>
          {r.stop.planned_arrival ? <Text style={s.nextWhen}>{`${t('ext_planned', 'Planned')} ${formatDayTime(r.stop.planned_arrival)}`}</Text> : null}
          <TouchableOpacity style={s.dirBtn} onPress={() => openMaps(r.stop)} activeOpacity={0.8}>
            <Navigation size={15} color={Colors.gray900} />
            <Text style={s.dirText}>{t('ext_directions', 'Directions')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.bigBtn} activeOpacity={0.85} disabled={!!m.sending} onPress={() => void m.sendTo({ stop_id: r.stop.id }, r.name)}>
            {m.sending ? <ActivityIndicator color="#fff" /> : <Camera size={22} color="#fff" strokeWidth={2.4} />}
            <Text style={s.bigText}>{m.sending ? t('tlog_sending', 'Sending…') : `${t('ext_send_at', 'Send screenshot at')} ${r.name}`}</Text>
          </TouchableOpacity>
          <Text style={s.oneShot}>{t('ext_one_shot', 'One screenshot of the customer app is enough.')}</Text>
        </View>
      ) : null}
      {m.rows.length === 0 ? (
        // No stops planned (the office didn't know them at booking): the driver adds each one.
        <View style={s.nextCard}>
          <Text style={s.eyebrow}>{t('ext_no_stops', 'No stops planned yet')}</Text>
          <Text style={s.nextWhen}>{t('ext_no_stops_hint', 'At each place, add the stop and send one screenshot of the customer app.')}</Text>
          <TouchableOpacity style={s.bigBtn} activeOpacity={0.85} onPress={onAdd} disabled={!!m.sending}>
            {m.sending ? <ActivityIndicator color="#fff" /> : <Plus size={22} color="#fff" strokeWidth={2.6} />}
            <Text style={s.bigText}>{m.sending ? t('tlog_sending', 'Sending…') : t('ext_add_stop_here', 'Add the stop you are at')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
{m.rows.length ? (
      <TouchableOpacity style={s.addLink} onPress={onAdd} activeOpacity={0.8}>
        <Plus size={16} color={Colors.primary} strokeWidth={2.6} />
        <Text style={s.addLinkText}>{r ? `${t('ext_not_at', 'Not at')} ${r.name}? ${t('ext_add_stop', 'Add a stop')}` : t('ext_add_stop', 'Add a stop')}</Text>
      </TouchableOpacity>
      ) : null}
      {m.rows.length ? <View style={s.listCard}>
        {m.rows.map((row, i) => (
          <View key={row.stop.id} style={[s.miniRow, i > 0 && s.rowBorder]}>
            <Bubble done={row.done} next={i === m.next} n={i + 1} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.miniName, i === m.next && { fontWeight: '800' }]} numberOfLines={1}>{row.name}</Text>
              <Text style={s.miniSub} numberOfLines={1}>{row.kind}{row.added ? ` · ${t('ext_added_by_you', 'added by you')}` : ''}</Text>
            </View>
            <Text style={[s.miniTime, row.done && { color: '#15803D' }]}>
              {row.done && row.doneAt ? formatTime(row.doneAt) : i === m.next ? t('tlog_next', 'Next') : ''}
            </Text>
          </View>
        ))}
      </View> : null}
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
                {locating ? t('ext_finding_location', 'Finding where you are…') : where ?? t('ext_no_location', 'Location not available — the screenshot\'s place is used')}
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
            {([['Pickup', t('ext_loading', 'Loading')], ['Dropoff', t('ext_dropoff', 'Drop-off')]] as const).map(([v, label]) => (
              <TouchableOpacity key={v} style={[s.seg, type === v && s.segOn]} onPress={() => setType(v)} activeOpacity={0.8}>
                <Text style={[s.segText, type === v && { color: '#fff' }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[s.bigBtn, locating && { opacity: 0.6 }]} disabled={locating} onPress={save} activeOpacity={0.85}>
            <Camera size={20} color="#fff" />
            <Text style={s.bigText}>{t('ext_add_and_send', 'Add stop and send screenshot')}</Text>
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
  nextName: { fontSize: 28, fontWeight: '800', color: Colors.gray900 },
  nextWhen: { fontSize: 14, color: Colors.gray500, fontWeight: '600' },
  dirBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: Colors.gray100, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginTop: 4 },
  dirText: { fontSize: 13, fontWeight: '700', color: Colors.gray900 },
  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 12, marginTop: 10 },
  bigText: { color: '#fff', fontSize: 17, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  oneShot: { fontSize: 12.5, color: Colors.gray500, textAlign: 'center', marginTop: 4 },
  addLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  addLinkText: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  listCard: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray200 },
  miniName: { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  miniSub: { fontSize: 12.5, color: Colors.gray500, marginTop: 1 },
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
