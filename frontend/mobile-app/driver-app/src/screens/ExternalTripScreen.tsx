/**
 * Customer-app trips (iMile, JD…) the way the normal trip works: the stops the
 * office planned, in order, and at each one ONE screenshot of the customer's
 * app (not three photos). A stop the office didn't plan can be added by the
 * driver. Each send is still a trip-log entry (shared-types tripLog); saying
 * where it was made puts it on that stop (POST /mobile/trips/:id/log/:entry/stop),
 * so the office sees the stop reached and checks the time off the screenshot.
 *
 * Three ways to show it, for the owner to choose from (route param `style`):
 *   next — one big card for the next stop and one button, like the normal trip
 *   list — every stop with its own button, any order
 *   tag  — one "Send screenshot" button, then "where is this?" with the next stop picked
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, ActivityIndicator, RefreshControl, Linking, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Camera, Check, Flag, MapPin, Navigation, Plus, RotateCcw, X } from 'lucide-react-native';
import { tripLogEntries, TRIP_LOG_OPERATION } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { tripService, stopLabel, type MobileTrip, type TripStop } from '@mercon/mobile-shared/lib/trips';
import { pickFromGallery, type CapturedPhoto } from '@mercon/mobile-shared/lib/camera';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { formatTime, formatDayTime } from '@mercon/mobile-shared/lib/dates';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { flipInRTL } from '@mercon/mobile-shared/lib/rtl';
import { useCurrentTrip } from '../hooks/use-current-trip';
import { DelayButton } from '../components/DelayButton';
import { DelayReportModal } from '../components/DelayReportModal';
import { showToast } from '../components/AppToast';

export type ExternalStyle = 'next' | 'list' | 'tag';

type Doc = NonNullable<MobileTrip['documents']>[number];
type Target = { stop_id: string } | { new_stop: { name: string; stop_type: 'Pickup' | 'Dropoff' } };

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

  /** Pick the screenshot and send it to `target` (null: just sent, placed later). */
  const sendTo = async (target: Target | null, label: string, photo?: CapturedPhoto | null) => {
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

export default function ExternalTripScreen({ style }: { style: ExternalStyle }) {
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
  const addStop = (name: string, type: 'Pickup' | 'Dropoff') => {
    setAdding(false);
    void m.sendTo({ new_stop: { name, stop_type: type } }, name);
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
          {[trip.ref_id, `${doneCount} ${t('ext_of', 'of')} ${m.rows.length} ${t('ext_stops_done', 'stops done')}`].filter(Boolean).join(' · ')}
        </Text>
        <View style={s.bar}>
          {m.rows.map((r, i) => <View key={r.stop.id} style={[s.barSeg, r.done && s.barDone, i === m.next && s.barNext]} />)}
        </View>
      </View>

      <ScrollView
        style={s.body}
        contentContainerStyle={{ padding: 16, paddingBottom: style === 'list' ? 120 : 190, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await m.refetch(); setRefreshing(false); }} />}
      >
        {m.failed ? (
          <TouchableOpacity style={s.failed} onPress={() => void m.deliver(m.failed!, '')} activeOpacity={0.85}>
            <RotateCcw size={16} color="#B42318" />
            <Text style={s.failedText}>{t('tlog_failed', 'Not sent. Tap to try again')}</Text>
          </TouchableOpacity>
        ) : null}
        {style === 'next' ? <NextStopView m={m} onAdd={() => setAdding(true)} /> : null}
        {style === 'list' ? <StopListView m={m} onAdd={() => setAdding(true)} /> : null}
        {style === 'tag' ? <StopListView m={m} compact /> : null}
        {m.loose.length ? <LooseSends m={m} /> : null}
      </ScrollView>

      <View style={s.footer}>
        {style === 'tag' ? <TagFooter m={m} onNew={() => setAdding(true)} /> : null}
        {style === 'next' && m.next < 0 ? (
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

/** Idea 1 — like the normal trip: the next stop big, one button, the rest as a short list. */
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
      <TouchableOpacity style={s.addLink} onPress={onAdd} activeOpacity={0.8}>
        <Plus size={16} color={Colors.primary} strokeWidth={2.6} />
        <Text style={s.addLinkText}>{r ? `${t('ext_not_at', 'Not at')} ${r.name}? ${t('ext_add_stop', 'Add a stop')}` : t('ext_add_stop', 'Add a stop')}</Text>
      </TouchableOpacity>
      <View style={s.listCard}>
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
      </View>
    </>
  );
}

/** Idea 2 — every stop with its own button (any order); idea 3 uses it read-only (`compact`). */
function StopListView({ m, onAdd, compact }: { m: Model; onAdd?: () => void; compact?: boolean }) {
  const { t } = useLanguage();
  return (
    <>
      {m.rows.map((r, i) => {
        const isNext = i === m.next;
        return (
          <View key={r.stop.id} style={s.row}>
            <View style={s.rail}>
              <Bubble done={r.done} next={isNext} n={i + 1} />
              {i < m.rows.length - 1 ? <View style={[s.line, r.done && { backgroundColor: '#16A34A' }]} /> : null}
            </View>
            <View style={[s.stopCard, isNext && s.stopCardNext]}>
              <View style={s.cardHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.stopName} numberOfLines={1}>{r.name}</Text>
                  <Text style={s.miniSub} numberOfLines={1}>
                    {r.kind}{r.added ? ` · ${t('ext_added_by_you', 'added by you')}` : ''}
                    {!r.done && r.stop.planned_arrival ? ` · ${t('ext_planned', 'Planned')} ${formatTime(r.stop.planned_arrival)}` : ''}
                  </Text>
                </View>
                {r.done ? (
                  <View style={s.doneChip}><Check size={12} color="#15803D" strokeWidth={3} /><Text style={s.doneChipText}>{r.doneAt ? formatTime(r.doneAt) : t('ext_done', 'Done')}</Text></View>
                ) : isNext ? <View style={s.nextChip}><Text style={s.nextChipText}>{t('tlog_next', 'Next')}</Text></View> : null}
              </View>
              {r.shots.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
                  {r.shots.map((d) => <Image key={d.id} source={{ uri: resolveMediaUrl(d.file_url) ?? undefined }} style={s.thumb} />)}
                </ScrollView>
              ) : null}
              {!compact && !r.done ? (
                <TouchableOpacity
                  style={[s.stopBtn, isNext ? s.stopBtnNext : s.stopBtnLater]}
                  activeOpacity={0.85}
                  disabled={!!m.sending}
                  onPress={() => void m.sendTo({ stop_id: r.stop.id }, r.name)}
                >
                  {m.sending === r.name ? <ActivityIndicator color={isNext ? '#fff' : Colors.gray900} /> : <Camera size={18} color={isNext ? '#fff' : Colors.gray900} />}
                  <Text style={[s.stopBtnText, !isNext && { color: Colors.gray900 }]}>{t('ext_send_screenshot', 'Send screenshot')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}
      {onAdd ? (
        <TouchableOpacity style={s.addCard} onPress={onAdd} activeOpacity={0.8}>
          <Plus size={18} color={Colors.primary} strokeWidth={2.6} />
          <View style={{ flex: 1 }}>
            <Text style={s.addLinkText}>{t('ext_add_stop', 'Add a stop')}</Text>
            <Text style={s.miniSub}>{t('ext_add_stop_hint', 'A stop the office did not plan — send its screenshot')}</Text>
          </View>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

/** Idea 3 — one button; after picking the screenshot, "where is this?" with the next stop already chosen. */
function TagFooter({ m, onNew }: { m: Model; onNew: () => void }) {
  const { t } = useLanguage();
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  // A new stop needs its name first: keep the screenshot until the sheet is filled in.
  const [held, setHeld] = useState<CapturedPhoto | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const pick = async () => {
    const shot = await pickFromGallery();
    if (!shot) return;
    setChoice(m.next >= 0 ? m.rows[m.next].stop.id : null);
    setPhoto(shot);
  };
  const send = () => {
    if (!photo) return;
    const shot = photo;
    setPhoto(null);
    if (choice === 'new') return onNewWith(shot);
    const r = m.rows.find((x) => x.stop.id === choice);
    if (r) void m.sendTo({ stop_id: r.stop.id }, r.name, shot);
  };
  const onNewWith = (shot: CapturedPhoto) => { setHeld(shot); setNewOpen(true); };
  const options = m.rows.filter((r) => !r.done);
  return (
    <>
      <Text style={s.hint}>{t('ext_tag_hint', 'At each stop, send one screenshot of the customer app.')}</Text>
      <TouchableOpacity style={s.bigBtn} activeOpacity={0.85} onPress={() => void pick()} disabled={!!m.sending}>
        {m.sending ? <ActivityIndicator color="#fff" /> : <Camera size={22} color="#fff" strokeWidth={2.4} />}
        <Text style={s.bigText}>{m.sending ? t('tlog_sending', 'Sending…') : t('ext_send_screenshot', 'Send screenshot')}</Text>
      </TouchableOpacity>
      <Modal visible={!!photo} transparent animationType="slide" onRequestClose={() => setPhoto(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{t('ext_where', 'Where is this screenshot from?')}</Text>
              <TouchableOpacity onPress={() => setPhoto(null)} hitSlop={10}><X size={20} color={Colors.gray500} /></TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {photo ? <Image source={{ uri: photo.uri }} style={s.preview} /> : null}
              <ScrollView style={{ flex: 1, maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
                {options.map((r) => {
                  const on = choice === r.stop.id;
                  const isNext = m.rows.indexOf(r) === m.next;
                  return (
                    <TouchableOpacity key={r.stop.id} style={[s.option, on && s.optionOn]} onPress={() => setChoice(r.stop.id)} activeOpacity={0.8}>
                      <View style={[s.radio, on && s.radioOn]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.optionName} numberOfLines={1}>{r.name}</Text>
                        <Text style={s.miniSub} numberOfLines={1}>{r.kind}{isNext ? ` · ${t('tlog_next', 'Next')}` : ''}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity style={[s.option, choice === 'new' && s.optionOn]} onPress={() => setChoice('new')} activeOpacity={0.8}>
                  <View style={[s.radio, choice === 'new' && s.radioOn]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.optionName}>{t('ext_somewhere_else', 'Somewhere else')}</Text>
                    <Text style={s.miniSub}>{t('ext_new_stop', 'A new stop the office did not plan')}</Text>
                  </View>
                </TouchableOpacity>
              </ScrollView>
            </View>
            <TouchableOpacity style={[s.bigBtn, !choice && { opacity: 0.4 }]} disabled={!choice} onPress={send} activeOpacity={0.85}>
              <Text style={s.bigText}>{t('ext_send', 'Send')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <AddStopSheet
        visible={newOpen}
        onClose={() => { setNewOpen(false); setHeld(null); }}
        onAdd={(name, type) => { setNewOpen(false); if (held) void m.sendTo({ new_stop: { name, stop_type: type } }, name, held); setHeld(null); }}
        withPhoto
      />
      {/* Plain "add a stop" without a screenshot already picked. */}
      <TouchableOpacity onPress={onNew} style={{ alignSelf: 'center' }} hitSlop={8}>
        <Text style={s.addLinkText}>{`+ ${t('ext_add_stop', 'Add a stop')}`}</Text>
      </TouchableOpacity>
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

function AddStopSheet({ visible, onClose, onAdd, withPhoto }: { visible: boolean; onClose: () => void; onAdd: (name: string, type: 'Pickup' | 'Dropoff') => void; withPhoto?: boolean }) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [type, setType] = useState<'Pickup' | 'Dropoff'>('Dropoff');
  const [shownFor, setShownFor] = useState(false);
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) { setName(''); setType('Dropoff'); }
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{t('ext_add_stop', 'Add a stop')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><X size={20} color={Colors.gray500} /></TouchableOpacity>
          </View>
          <Text style={s.miniSub}>{t('ext_add_stop_sub', 'A stop the office did not plan. The office sees it on the trip.')}</Text>
          <Text style={s.label}>{t('ext_place', 'Place')}</Text>
          <TextInput value={name} onChangeText={setName} placeholder={t('ext_place_hint', 'e.g. Taif, Majzuah')} placeholderTextColor={Colors.gray400} style={s.input} autoFocus />
          <Text style={s.label}>{t('ext_what', 'What happens here')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([['Pickup', t('ext_loading', 'Loading')], ['Dropoff', t('ext_dropoff', 'Drop-off')]] as const).map(([v, label]) => (
              <TouchableOpacity key={v} style={[s.seg, type === v && s.segOn]} onPress={() => setType(v)} activeOpacity={0.8}>
                <Text style={[s.segText, type === v && { color: '#fff' }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[s.bigBtn, !name.trim() && { opacity: 0.4 }]} disabled={!name.trim()} onPress={() => onAdd(name.trim(), type)} activeOpacity={0.85}>
            {withPhoto ? null : <Camera size={20} color="#fff" />}
            <Text style={s.bigText}>{withPhoto ? t('ext_send', 'Send') : t('ext_add_and_send', 'Add stop and send screenshot')}</Text>
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
  row: { flexDirection: 'row', gap: 12 },
  rail: { width: 26, alignItems: 'center', paddingTop: 14 },
  line: { flex: 1, width: 2, backgroundColor: Colors.gray300, marginTop: 4, marginBottom: -12 },
  stopCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: 'transparent' },
  stopCardNext: { borderColor: Colors.primary },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopName: { fontSize: 17, fontWeight: '800', color: Colors.gray900 },
  doneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5EE', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  doneChipText: { fontSize: 12, fontWeight: '800', color: '#15803D' },
  nextChip: { backgroundColor: Colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  nextChipText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  thumb: { width: 60, height: 108, borderRadius: 8, backgroundColor: Colors.gray200 },
  stopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 12, marginTop: 12 },
  stopBtnNext: { backgroundColor: Colors.primary },
  stopBtnLater: { backgroundColor: Colors.gray100 },
  stopBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  addCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.primary, padding: 14, marginLeft: 38 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', padding: 16, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
  hint: { fontSize: 12.5, color: Colors.gray500, textAlign: 'center' },
  finishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gray100, borderRadius: 16, paddingVertical: 13 },
  finishReady: { backgroundColor: '#16A34A' },
  finishText: { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 30, gap: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: Colors.gray900, flex: 1 },
  preview: { width: 92, height: 170, borderRadius: 10, backgroundColor: Colors.gray200 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.gray200, padding: 12 },
  optionOn: { borderColor: Colors.primary, backgroundColor: '#FFF4F1' },
  optionName: { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.gray300 },
  radioOn: { borderColor: Colors.primary, borderWidth: 6 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.gray700, marginTop: 6 },
  input: { borderWidth: 1, borderColor: Colors.gray300, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: Colors.gray900 },
  seg: { flex: 1, alignItems: 'center', borderRadius: 12, paddingVertical: 12, backgroundColor: Colors.gray100 },
  segOn: { backgroundColor: Colors.gray900 },
  segText: { fontSize: 15, fontWeight: '800', color: Colors.gray900 },
  chip: { backgroundColor: Colors.gray100, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.gray900 },
});
