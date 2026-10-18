/**
 * Trip log — customer-app trips (iMile, JD…) whose stops aren't known when the
 * trip is booked. After Start the driver stays here: at every stop they send
 * the customer app's screenshots (as many as needed, as often as needed); each
 * send is one entry with its time and where the phone was. Finish trip closes
 * it. The office turns entries into stops afterwards (shared-types tripLog).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Camera, CircleCheckBig, ImagePlus, MapPin, RotateCcw, Undo2, Flag, Check, ChevronRight } from 'lucide-react-native';
import { canUndoTripLogEntry, tripLogEntries, TRIP_LOG_OPERATION, type TripLogEntry } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { tripService, stopLabel, type MobileTrip } from '@mercon/mobile-shared/lib/trips';
import { pickManyFromGallery, type CapturedPhoto } from '@mercon/mobile-shared/lib/camera';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { formatTime, formatDayTime } from '@mercon/mobile-shared/lib/dates';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { flipInRTL } from '@mercon/mobile-shared/lib/rtl';
import { useCurrentTrip } from '../hooks/use-current-trip';
import { DelayButton } from '../components/DelayButton';
import { DelayReportModal } from '../components/DelayReportModal';
import { showToast } from '../components/AppToast';

type Doc = NonNullable<MobileTrip['documents']>[number];

/** A send still on the phone: uploading, or failed and waiting for a retry. */
interface Pending {
  entry: string;
  photos: CapturedPhoto[];
  place: string | null;
  /** Photos already on the server (a retry sends only the rest). */
  done: Set<string>;
  failed: boolean;
  /** Screenshots added to an entry that is already sent. */
  addTo?: boolean;
}

/** For the take-back window; read in handlers, not during render. */
const nowMs = () => Date.now();

const newEntryId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default function TripLogScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { trip, refetch, setTrip } = useCurrentTrip({ pollMs: 30_000 });
  const [pending, setPending] = useState<Pending[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [delayOpen, setDelayOpen] = useState(false);
  const [now, setNow] = useState(nowMs);

  const entries = useMemo(() => tripLogEntries<Doc>(trip?.documents ?? []), [trip?.documents]);
  const busy = pending.some((p) => !p.failed);

  const shotsWord = (n: number) => `${n} ${n === 1 ? t('tlog_screenshot', 'screenshot') : t('tlog_screenshots', 'screenshots')}`;

  /** Uploads one send; on failure it stays in `pending` with a retry. */
  const upload = async (p: Pending) => {
    if (!trip) return;
    setPending((all) => [...all.filter((x) => x.entry !== p.entry || x.addTo !== p.addTo), { ...p, failed: false }]);
    let ok = true;
    for (const photo of p.photos) {
      if (p.done.has(photo.uri)) continue;
      try {
        await tripService.uploadPhoto(trip.id, 'cargo', photo, undefined, TRIP_LOG_OPERATION, undefined, undefined, { entry: p.entry, place: p.place });
        p.done.add(photo.uri);
      } catch {
        ok = false;
        break;
      }
    }
    await refetch();
    setNow(nowMs());
    setPending((all) => ok
      ? all.filter((x) => !(x.entry === p.entry && x.addTo === p.addTo))
      : all.map((x) => (x.entry === p.entry && x.addTo === p.addTo ? { ...p, failed: true } : x)));
    if (!ok) showToast(t('tlog_failed', 'Not sent. Tap to try again'), 'error');
  };

  const send = async (addToEntry?: TripLogEntry<Doc>) => {
    try {
      const photos = await pickManyFromGallery();
      if (photos.length === 0) return;
      const place = addToEntry?.place ?? photos.find((p) => p.location?.city)?.location?.city ?? null;
      void upload({ entry: addToEntry?.id ?? newEntryId(), photos, place, done: new Set(), failed: false, addTo: !!addToEntry });
    } catch (e) {
      showToast(getApiErrorMessage(e), 'error');
    }
  };

  const undo = (e: TripLogEntry<Doc>) => {
    if (!trip) return;
    Alert.alert(t('tlog_undo', 'Take back'), t('tlog_undo_confirm', 'Take back this update? The office will not see it.'), [
      { text: t('action_cancel', 'Cancel'), style: 'cancel' },
      {
        text: t('tlog_undo', 'Take back'),
        style: 'destructive',
        onPress: async () => {
          try {
            await tripService.undoTripLogEntry(trip.id, e.id);
            await refetch();
          } catch (err) {
            showToast(getApiErrorMessage(err), 'error');
          }
        },
      },
    ]);
  };

  const finish = () => {
    if (!trip) return;
    if (busy) return showToast(t('tlog_wait_uploads', 'Wait until all screenshots are sent.'), 'error');
    if (entries.length === 0) return showToast(t('tlog_finish_empty', 'Send at least one screenshot before finishing.'), 'error');
    Alert.alert(t('tlog_finish', 'Finish trip'), t('tlog_finish_confirm', 'Finish this trip? Send the last screenshot first.'), [
      { text: t('action_cancel', 'Cancel'), style: 'cancel' },
      {
        text: t('tlog_finish', 'Finish trip'),
        onPress: async () => {
          setFinishing(true);
          try {
            const done = await tripService.updateStatus(trip.id, 'Completed', 'COMPLETED');
            setTrip(done);
            router.replace({ pathname: '/trip/completed', params: { tripId: trip.id } } as any);
          } catch (err) {
            showToast(getApiErrorMessage(err), 'error');
          } finally {
            setFinishing(false);
          }
        },
      },
    ]);
  };

  if (!trip) {
    return (
      <SafeAreaView style={[s.page, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.primary} />
      </SafeAreaView>
    );
  }

  const latest = entries[entries.length - 1];
  // The planned route as places in order, done ones ticked and the next one marked — so the
  // driver sees what is left, not only what was sent. The same place twice in a row is one stop.
  const route: { name: string; done: boolean }[] = [];
  for (const st of [...(trip.stops ?? [])].sort((a, b) => a.stop_sequence - b.stop_sequence)) {
    const name = stopLabel(st) ?? '';
    const done = !!st.actual_arrival;
    const prev = route[route.length - 1];
    if (prev && prev.name === name) prev.done = prev.done && done;
    else if (name) route.push({ name, done });
  }
  const nextStop = route.findIndex((r) => !r.done);
  const newSends = pending.filter((p) => !p.addTo);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.page, { backgroundColor: Colors.primary }]}>
      <View style={s.band}>
        <View style={s.topRow}>
          <TouchableOpacity style={s.backBtn} activeOpacity={0.8} onPress={() => router.back()} accessibilityLabel={t('action_back', 'Back')}>
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.4} style={flipInRTL} />
          </TouchableOpacity>
          <DelayButton onPress={() => setDelayOpen(true)} />
        </View>
        <Text style={s.title}>{t('tlog_title', 'Trip log')}</Text>
        <Text style={s.sub} numberOfLines={1}>
          {[trip.ref_id, trip.customer?.name].filter(Boolean).join(' · ')}
        </Text>
        <View style={s.route}>
          {route.map((r, i) => (
            <React.Fragment key={`${r.name}-${i}`}>
              {i > 0 ? <ChevronRight size={14} color="rgba(255,255,255,0.7)" style={flipInRTL} /> : null}
              <View style={[s.stopPill, r.done && s.stopDone, i === nextStop && s.stopNext]}>
                {r.done ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
                <Text style={[s.stopText, i === nextStop && s.stopTextNext]} numberOfLines={1}>
                  {i === nextStop ? `${t('tlog_next', 'Next')}: ${r.name}` : r.name}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      <ScrollView
        style={s.body}
        contentContainerStyle={{ padding: 16, paddingBottom: 200 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setNow(nowMs()); setRefreshing(false); }} />}
      >
        <View style={s.row}>
          <View style={s.rail}><View style={[s.dot, { backgroundColor: Colors.gray900 }]} /><View style={s.line} /></View>
          <View style={{ flex: 1, paddingBottom: 18 }}>
            <Text style={s.when}>{formatDayTime(trip.actual_start)}</Text>
            <Text style={s.what}>{t('tlog_started', 'Trip started')}</Text>
          </View>
        </View>

        {entries.length === 0 && newSends.length === 0 ? (
          <Text style={s.empty}>{t('tlog_empty', 'Nothing sent yet. Send the first screenshot at the loading place.')}</Text>
        ) : null}

        {entries.map((e, i) => {
          const adding = pending.find((p) => p.addTo && p.entry === e.id);
          return (
            <View key={e.id} style={s.row}>
              <View style={s.rail}>
                <View style={[s.dot, { backgroundColor: e.stop_id ? '#16A34A' : Colors.primary }]}>
                  {e.stop_id ? <Check size={10} color="#fff" strokeWidth={3} /> : null}
                </View>
                {i < entries.length - 1 || newSends.length ? <View style={s.line} /> : null}
              </View>
              <View style={s.card}>
                <View style={s.cardHead}>
                  <Text style={s.when}>{formatTime(e.at)}</Text>
                  {e.place ? (
                    <View style={s.placeRow}>
                      <MapPin size={13} color={Colors.gray500} />
                      <Text style={s.place} numberOfLines={1}>{t('tlog_near', 'near')} {e.place}</Text>
                    </View>
                  ) : <View style={{ flex: 1 }} />}
                  <Text style={s.count}>{shotsWord(e.docs.length)}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
                  {e.docs.map((d) => (
                    <Image key={d.id} source={{ uri: resolveMediaUrl(d.file_url) ?? undefined }} style={s.thumb} />
                  ))}
                  {adding ? adding.photos.filter((p) => !adding.done.has(p.uri)).map((p) => (
                    <View key={p.uri}>
                      <Image source={{ uri: p.uri }} style={[s.thumb, { opacity: 0.5 }]} />
                      {!adding.failed ? <ActivityIndicator style={StyleSheet.absoluteFill} color={Colors.primary} /> : null}
                    </View>
                  )) : null}
                </ScrollView>
                {e.stop_id ? (
                  <Text style={s.used}>{t('tlog_used', 'Added to the trip by the office')}</Text>
                ) : (
                  <View style={s.actions}>
                    {adding?.failed ? (
                      <TouchableOpacity style={s.chip} onPress={() => void upload(adding)}>
                        <RotateCcw size={14} color="#B42318" />
                        <Text style={[s.chipText, { color: '#B42318' }]}>{t('tlog_failed', 'Not sent. Tap to try again')}</Text>
                      </TouchableOpacity>
                    ) : e === latest ? (
                      <TouchableOpacity style={s.chip} onPress={() => void send(e)} disabled={!!adding}>
                        <ImagePlus size={14} color={Colors.gray900} />
                        <Text style={s.chipText}>{t('tlog_add_more', 'Add more')}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {canUndoTripLogEntry(e, now) && !adding ? (
                      <TouchableOpacity style={s.chip} onPress={() => undo(e)}>
                        <Undo2 size={14} color={Colors.gray500} />
                        <Text style={[s.chipText, { color: Colors.gray500 }]}>{t('tlog_undo', 'Take back')}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {newSends.map((p, i) => (
          <View key={p.entry} style={s.row}>
            <View style={s.rail}>
              <View style={[s.dot, { backgroundColor: p.failed ? '#D92D20' : Colors.gray400 }]} />
              {i < newSends.length - 1 ? <View style={s.line} /> : null}
            </View>
            <TouchableOpacity style={[s.card, p.failed && s.cardFailed]} disabled={!p.failed} onPress={() => void upload(p)} activeOpacity={0.8}>
              <View style={s.cardHead}>
                <Text style={s.when}>{p.failed ? t('tlog_failed', 'Not sent. Tap to try again') : t('tlog_sending', 'Sending…')}</Text>
                <Text style={s.count}>{shotsWord(p.photos.length)}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
                {p.photos.map((ph) => <Image key={ph.uri} source={{ uri: ph.uri }} style={[s.thumb, !p.done.has(ph.uri) && { opacity: 0.5 }]} />)}
              </ScrollView>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <View style={s.footer}>
        <Text style={s.hint}>{t('tlog_hint', 'At every stop, send the customer app screenshot. Pick as many as you need.')}</Text>
        <TouchableOpacity style={s.sendBtn} activeOpacity={0.85} onPress={() => void send()}>
          <Camera size={22} color="#fff" strokeWidth={2.4} />
          <Text style={s.sendText}>{t('tlog_send', 'Send screenshots')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.finishBtn} activeOpacity={0.85} onPress={finish} disabled={finishing}>
          {finishing ? <ActivityIndicator color={Colors.gray900} /> : <Flag size={18} color={Colors.gray900} />}
          <Text style={s.finishText}>{t('tlog_finish', 'Finish trip')}</Text>
          {entries.length ? <CircleCheckBig size={16} color="#16A34A" /> : null}
        </TouchableOpacity>
      </View>

      <DelayReportModal visible={delayOpen} tripId={trip.id} onClose={() => setDelayOpen(false)} onSuccess={() => setDelayOpen(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.gray100 },
  band: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  sub: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  route: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 10 },
  stopPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.18)', maxWidth: 180 },
  stopDone: { backgroundColor: 'rgba(22,163,74,0.9)' },
  stopNext: { backgroundColor: '#fff' },
  stopText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  stopTextNext: { color: Colors.gray900, fontWeight: '800' },
  body: { flex: 1, backgroundColor: Colors.gray100, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  row: { flexDirection: 'row', gap: 12 },
  rail: { width: 18, alignItems: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, backgroundColor: Colors.gray300, marginTop: 2 },
  when: { fontSize: 14, fontWeight: '800', color: Colors.gray900 },
  what: { fontSize: 13, color: Colors.gray500, marginTop: 2 },
  empty: { fontSize: 14, color: Colors.gray500, marginLeft: 30, marginBottom: 12 },
  card: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 10 },
  cardFailed: { borderWidth: 1, borderColor: '#FDA29B', backgroundColor: '#FEF3F2' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: { fontSize: 12, fontWeight: '700', color: Colors.gray500 },
  placeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
  place: { fontSize: 13, color: Colors.gray700, fontWeight: '600' },
  // Big enough to recognise which screen of the customer's app it is.
  thumb: { width: 84, height: 150, borderRadius: 10, backgroundColor: Colors.gray200, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.gray300 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gray100, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.gray900 },
  used: { fontSize: 12, fontWeight: '700', color: '#15803D', marginTop: 10 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', padding: 16, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
  hint: { fontSize: 12.5, color: Colors.gray500, textAlign: 'center' },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: 18, paddingVertical: 16 },
  sendText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  finishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gray100, borderRadius: 16, paddingVertical: 13 },
  finishText: { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
});
