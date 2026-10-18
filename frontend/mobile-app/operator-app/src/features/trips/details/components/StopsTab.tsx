/** Every stop in order: planned vs actual time, lateness, delay reason, photos, and screenshots to check. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Image } from 'react-native';
import { Check, CheckCheck, Clock3, Image as ImageIcon, ImageOff, MapPin, MessageCircle, Navigation, Play, TriangleAlert, Undo2, Crosshair, ArrowRightLeft, CircleCheck } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import type { DriverUpdate, LiveMediaItem, OperatorTripDetail, TripPhase } from '../../../../lib/operator';
import { ON_TIME_GRACE_MIN, TONE, delayText, mapsLink, minutesLate, minutesText, photoPinsForStop, sendStatus, sortedStops, stopName, stopTiming, tripLegsOf, updateTitle, type Formatters, type Stop } from '../tripDetailsModel';
import { extraStopNote } from '@mercon/shared-types';
import { liveLegOf } from '../../tripLegs';
import { Card, Chip, INK, MUTED, WA, WA_INK, WA_LIGHT, tap } from './parts';
import { isAppScreenshot, isDropoff, pendingTimeCheck } from './TripTimesSheet';

interface Props {
  trip: OperatorTripDetail;
  phase: TripPhase;
  updates: DriverUpdate[];
  f: Formatters;
  /** Open the viewer on one photo set, at `index`. */
  onOpenPhotos: (u: DriverUpdate, index: number) => void;
  /** Open the share sheet on one photo set. */
  onSendUpdate: (u: DriverUpdate) => void;
  /** Open "Check times" — every stop's real time, copied off the customer-app screenshots. */
  /** Open "Check times"; from one stop's link, with only that stop's screenshots. */
  onCheckTimes: (stopId?: string) => void;
  /** Open "Set pin" for a stop still on a guessed location. */
  onSetPin: (stop: Stop) => void;
  /** A stop to highlight — the one a tapped notification is about. */
  focusStopId?: string | null;
  /** Where each stop's row sits inside the tab, so the page can scroll to it. */
  onStopLayout?: (stopId: string, y: number) => void;
  /** "Undo driver's step" — shown while the driver has progress the office can take back. */
  onStepBack?: () => void;
  /** Bring back the photos a step-back removed. */
  onRestorePhotos?: (removedAt: string) => void;
}

/** "45m", "2.8h", "5h" — short enough to sit on the line between two stops. */
const shortDuration = (min: number) => (min < 60 ? `${Math.round(min)}m` : `${(min / 60).toFixed(1).replace(/\.0$/, '')}h`);

/** Only an EXACT pin can be trusted for ETA, navigation and arrival — anything else needs one. */
export const needsPin = (st: Stop) =>
  st.location_coordinate_precision !== 'EXACT' || !Number.isFinite(st.location_lat) || !(st.location_lat || st.location_lng);

export function StopsTab({ trip, phase, updates, f, onOpenPhotos, onSendUpdate, onCheckTimes, onSetPin, focusStopId, onStopLayout, onStepBack, onRestorePhotos }: Props) {
  const stops = sortedStops(trip);
  // Round trip: a heading over each leg — "Leg 1 · Riyadh → Jeddah", "Leg 2 · Jeddah → Riyadh".
  const legs = tripLegsOf(trip);
  const legTitle = (part: Stop[], n: 1 | 2) =>
    part.length ? `Leg ${n} · ${n === 1 ? 'going' : 'returning'} · ${stopName(part[0], stops.indexOf(part[0]))} → ${stopName(part[part.length - 1], stops.indexOf(part[part.length - 1]))}` : null;
  const liveLeg = phase === 'active' ? liveLegOf(legs, trip.status) : null;
  const legStart = legs.round
    ? new Map<string, { title: string | null; current: boolean }>([
        [legs.outbound[0]?.id, { title: legTitle(legs.outbound, 1), current: liveLeg === 1 }],
        [legs.ret[0]?.id, { title: legTitle(legs.ret, 2), current: liveLeg === 2 }],
      ])
    : null;
  const nextIdx = phase === 'active' ? stops.findIndex((s) => !s.actual_arrival) : -1;
  const docs = trip.documents ?? [];

  if (stops.length === 0) {
    return <Card><Text style={s.muted}>This trip has no stops.</Text></Card>;
  }

  const purged = trip.media_purged;
  const shots = docs.filter(isAppScreenshot);
  const pendingShots = shots.filter(pendingTimeCheck).length;

  return (
    <Card style={{ paddingVertical: 8 }}>
      {extraStopNote(trip) ? (
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#B54708', paddingHorizontal: 12, paddingVertical: 6 }}>{extraStopNote(trip)}</Text>
      ) : null}
      {(trip.step_backs ?? []).slice(0, 3).map((b, k) => (
        <View key={`${b.at}-${k}`} style={s.backNote}>
          <Undo2 size={14} color="#5B34B0" />
          <View style={{ flex: 1 }}>
            <Text style={s.backNoteTitle}>
              Taken back by {b.by ?? 'the office'} · {f.smart(b.at)}
            </Text>
            <Text style={s.backNoteText}>
              {b.from ? `${b.from} → ` : ''}{b.to ?? 'an earlier step'}
              {b.photos && b.photos.count > 0
                ? ` · ${b.photos.count} photo${b.photos.count === 1 ? '' : 's'} ${b.photos.choice === 'move' ? `moved to ${b.photos.moved_to ?? 'the redone step'}` : b.photos.choice === 'remove' ? 'removed' : 'left as they were'}`
                : ''}
            </Text>
            {b.photos?.removed_at && (b.photos.restorable ?? 0) > 0 && onRestorePhotos ? (
              <TouchableOpacity style={s.restore} onPress={() => onRestorePhotos(b.photos!.removed_at!)} hitSlop={6} accessibilityRole="button">
                <Text style={s.restoreText}>Restore {b.photos.restorable} photo{b.photos.restorable === 1 ? '' : 's'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ))}
      {purged ? (
        <View style={s.purged}>
          <ImageIcon size={13} color={MUTED} />
          <Text style={s.purgedText}>
            {purged.count} {purged.count === 1 ? 'photo/video' : 'photos/videos'} from this trip were deleted on {f.date(purged.purged_at)}, {purged.retention_days} days after the trip ended.
          </Text>
        </View>
      ) : null}
      {/* One row of tools instead of stacked bars: fix the driver's steps, or the stop times. */}
      {onStepBack || stops.some((st) => st.actual_arrival) || shots.length > 0 ? (
        <View style={s.tools}>
          {onStepBack ? (
            <TouchableOpacity style={s.tool} activeOpacity={0.75} onPress={onStepBack} accessibilityRole="button" accessibilityLabel="Driver's steps: undo or mark done">
              <Undo2 size={15} color={INK} />
              <Text style={s.toolText} numberOfLines={1}>{"Driver's steps"}</Text>
            </TouchableOpacity>
          ) : null}
          {stops.some((st) => st.actual_arrival) || shots.length > 0 ? (
            <TouchableOpacity style={s.tool} activeOpacity={0.75} onPress={() => onCheckTimes()} accessibilityRole="button" accessibilityLabel="Edit stop times">
              <Clock3 size={15} color={INK} />
              <Text style={s.toolText} numberOfLines={1}>Edit times</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {pendingShots > 0 ? (
        <TouchableOpacity style={s.timesBar} activeOpacity={0.8} onPress={() => onCheckTimes()}>
          <Clock3 size={14} color="#8A5200" />
          <Text style={s.timesText}>{pendingShots} screenshot{pendingShots === 1 ? '' : 's'} · check the stop times</Text>
          <Text style={s.timesCta}>Check</Text>
        </TouchableOpacity>
      ) : null}
      {stops.map((st, i) => {
        const done = phase === 'done' || !!st.actual_arrival;
        const isNext = i === nextIdx;
        const last = i === stops.length - 1;
        const late = minutesLate(st.planned_arrival, st.actual_arrival);
        const delay = delayText(st);
        const sets = updates.filter((u) => u.stop?.id === st.id);
        const check = docs.find((d) => pendingTimeCheck(d) && d.ai_extracted_json?.stop_id === st.id);
        // Is this stop's time read off the customer's screenshot yet? (TestFlight: "show whether the time is confirmed or needs to confirm")
        const stopShots = shots.filter((d) => d.ai_extracted_json?.stop_id === st.id);
        const timeState: TimeState = check ? 'pending' : stopShots.length ? 'confirmed' : null;
        // Time on the road to the next stop, like the customer's app shows it (TestFlight: "show taken transit time").
        const nextSt = stops[i + 1];
        const leftAt = isDropoff(st) ? st.actual_departure ?? st.actual_arrival : st.actual_departure;
        // Offloading then loading at the same place isn't a drive.
        const samePlace = !!nextSt && stopName(nextSt, i + 1) === stopName(st, i);
        const transit = nextSt?.actual_arrival && leftAt && !samePlace ? (Date.parse(nextSt.actual_arrival) - Date.parse(leftAt)) / 60_000 : null;
        const pinNeeded = (phase === 'planned' || phase === 'active') && !st.actual_arrival && needsPin(st);
        // Driver photos at this stop that carry a GPS fix — a better pin than a guessed one.
        const gpsPhotos = photoPinsForStop(updates, st.id).length;
        const bubbleBg = phase === 'cancelled' ? '#D6D3D1' : done ? TONE.green.dot : isNext ? TONE.blue.dot : phase === 'planned' ? '#F5F2FD' : Colors.white;
        const bubbleBorder = done || isNext || phase === 'cancelled' ? 'transparent' : phase === 'planned' ? '#B7A6EC' : '#B8BCC8';
        const leg = legs.round && legs.ret.includes(st) ? ' · return' : '';
        const heading = legStart?.get(st.id);
        const times = st.actual_arrival
          ? `arrived ${f.smart(st.actual_arrival)}${st.actual_departure ? ` · left ${f.time(st.actual_departure)}` : ''}`
          : st.planned_arrival ? `due ${f.smart(st.planned_arrival)}` : 'no time planned';

        return (
          <React.Fragment key={st.id}>
          {heading?.title ? (
            <View style={[s.legHead, i > 0 && s.legHeadGap]}>
              <Text style={[s.legHeadText, heading.current && { color: TONE.blue.fg }]}>{heading.title}</Text>
              {heading.current ? <Chip label="Now" tone="blue" /> : null}
            </View>
          ) : null}
          <View
            style={[s.row, isNext && s.rowNext, st.id === focusStopId && s.rowFocus]}
            onLayout={onStopLayout ? (e) => onStopLayout(st.id, e.nativeEvent.layout.y) : undefined}
          >
            <View style={s.rail}>
              <View style={[s.bubble, { backgroundColor: bubbleBg, borderColor: bubbleBorder }, isNext && s.bubbleNext]}>
                {done ? <Check size={13} color={Colors.white} strokeWidth={3.2} /> : (
                  <Text style={[s.bubbleText, isNext && { color: Colors.white }, phase === 'planned' && { color: '#5B34B0' }]}>{i + 1}</Text>
                )}
              </View>
              {!last ? (
                <View style={[s.line, { backgroundColor: done && phase !== 'cancelled' ? TONE.green.dot : '#DDE0E8' }]}>
                  {/* Actual time on the road (left this stop → reached the next), in the middle of the line — as the customer's app (iMile) shows it. */}
                  {transit != null && transit >= 0 ? (
                    <View style={s.transitWrap} pointerEvents="none" accessibilityLabel={`${minutesText(transit)} on the road to ${stopName(nextSt, i + 1)}`}>
                      <Text style={s.transitPill}>{shortDuration(transit)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={[s.body, !last && { paddingBottom: 16 }]}>
              <View style={s.titleRow}>
                <Text style={[s.name, isNext && { fontWeight: '800' }]} numberOfLines={2}>{stopName(st, i)}</Text>
                {isNext ? <Chip label="Next" tone="blue" solid /> : late != null ? (
                  <Chip label={late > ON_TIME_GRACE_MIN ? `${late} min late` : 'On time'} tone={late > ON_TIME_GRACE_MIN ? 'red' : 'green'} />
                ) : null}
              </View>
              <Text style={s.muted}>{st.stop_type}{leg}{st.actual_arrival ? '' : ` · ${times}`}</Text>
              {st.actual_arrival ? (() => {
                const { late: lateMin, dwell } = stopTiming(st);
                return (
                  <>
                    {/* Planned vs real, side by side */}
                    <View style={s.timeGrid}>
                      <TimeCell label="PLANNED" f={f} iso={st.planned_arrival} />
                      <TimeCell label="ARRIVED" f={f} iso={st.actual_arrival} tone={lateMin != null && lateMin > ON_TIME_GRACE_MIN ? 'red' : lateMin != null ? 'green' : undefined} />
                      {isDropoff(st) ? null : <TimeCell label="LEFT" f={f} iso={st.actual_departure} empty={phase === 'active' ? 'Still there' : '—'} />}
                    </View>
                    <Text style={s.timeNote}>
                      {lateMin == null ? 'No planned time' : lateMin > ON_TIME_GRACE_MIN ? `${minutesText(lateMin)} late` : lateMin < -ON_TIME_GRACE_MIN ? `${minutesText(lateMin)} early` : 'On time'}
                      {dwell != null && !isDropoff(st) ? ` · ${minutesText(dwell)} at the stop` : ''}
                    </Text>
                  </>
                );
              })() : null}

              {delay ? (
                <View style={s.delay}>
                  <TriangleAlert size={13} color="#912018" />
                  <Text style={s.delayText}>{delay}</Text>
                </View>
              ) : null}

              {/* Small chips on one line instead of stacked banners. */}
              {pinNeeded || (needsPin(st) && gpsPhotos > 0) || (check && sets.length === 0) ? (
                <View style={s.hints}>
                  {pinNeeded || (needsPin(st) && gpsPhotos > 0) ? (
                    <TouchableOpacity style={s.hint} activeOpacity={0.8} onPress={() => onSetPin(st)} accessibilityRole="button">
                      {gpsPhotos > 0 ? <Crosshair size={12} color="#8A5200" /> : <MapPin size={12} color="#8A5200" />}
                      <Text style={s.hintText}>
                        {gpsPhotos > 0 ? (pinNeeded ? 'Set pin from GPS' : 'Pin: use GPS') : 'Set pin'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {check && sets.length === 0 ? (
                    <TouchableOpacity style={s.hint} activeOpacity={0.8} onPress={() => onCheckTimes(st.id)} accessibilityRole="button">
                      <Clock3 size={12} color="#8A5200" />
                      <Text style={s.hintText}>Check time</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {sets.map((u, k) => (
                <PhotoSet key={u.key} u={u} f={f} onOpen={(i) => onOpenPhotos(u, i)} onSend={() => onSendUpdate(u)}
                  timeState={k === 0 ? timeState : null} onCheckTime={() => onCheckTimes(st.id)} />
              ))}

              <View style={s.links}>
                {Number.isFinite(st.location_lat) && (st.location_lat || st.location_lng) ? (
                  <TouchableOpacity style={s.link} onPress={() => Linking.openURL(mapsLink(st.location_lat, st.location_lng)).catch(() => {})} hitSlop={6}>
                    <Navigation size={13} color="#2449A8" />
                    <Text style={s.linkText}>Directions</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
          </React.Fragment>
        );
      })}
    </Card>
  );
}

/** One time box: the time on its own line (it must never be cut off), the day under it when it isn't today. */
function TimeCell({ label, f, iso, tone, empty = '—' }: { label: string; f: Formatters; iso?: string | null; tone?: 'red' | 'green'; empty?: string }) {
  const time = f.time(iso);
  const day = time && f.dayKey(iso) !== f.dayKey(new Date().toISOString()) ? f.dayMonth(iso) : '';
  return (
    <View style={s.timeCell}>
      <Text style={s.timeLabel}>{label}</Text>
      <Text style={[s.timeValue, tone === 'red' && { color: '#B42318' }, tone === 'green' && { color: '#15803D' }]} numberOfLines={1}>{time || empty}</Text>
      {day ? <Text style={s.timeDay} numberOfLines={1}>{day}</Text> : null}
    </View>
  );
}

const THUMBS = 4;
const isVideo = (m: LiveMediaItem) => m.kind === 'video' || !!m.mime?.startsWith('video/');

type TimeState = 'confirmed' | 'pending' | null;

/** One photo set at a stop: the pictures themselves, each marked sent or not, and whether the customer has them. */
function PhotoSet({ u, f, onOpen, onSend, timeState, onCheckTime }: {
  u: DriverUpdate; f: Formatters; onOpen: (index: number) => void; onSend: () => void;
  /** Whether the stop's time has been checked against the customer-app screenshot. */
  timeState?: TimeState; onCheckTime?: () => void;
}) {
  const status = sendStatus(u);
  // One photo sent is enough: the set is done, the unsent photos keep their "not sent" mark.
  const sent = status.state !== 'unsent';
  const shown = u.items.slice(0, THUMBS);
  const extra = u.items.length - shown.length;
  return (
    <View style={[s.set, sent ? s.setSent : s.setUnsent]}>
      <Text style={s.setTitle}>{updateTitle(u)} · {u.items.length} {u.items.length === 1 ? 'photo' : 'photos'}</Text>
      {(() => {
        // When they were taken and when they reached us — a big gap means the phone was offline.
        const taken = u.items.map((m) => m.captured_at).sort();
        const uploaded = u.items.map((m) => m.uploaded_at).filter((x): x is string => !!x).sort();
        const gps = u.items.filter((m) => m.gps).length;
        const moved = u.items.filter((m) => m.moved_at).length;
        return (
          <>
            <Text style={s.setMeta} numberOfLines={2}>
              Taken {f.smart(taken[0])}{taken.length > 1 && f.time(taken[taken.length - 1]) !== f.time(taken[0]) ? `–${f.time(taken[taken.length - 1])}` : ''}
              {uploaded.length ? ` · uploaded ${f.smart(uploaded[uploaded.length - 1])}` : ''}
              {` · ${gps === u.items.length ? 'all geotagged' : gps > 0 ? `${gps} geotagged` : 'no GPS'}`}
            </Text>
            {moved > 0 ? (
              <View style={s.movedTag}>
                <ArrowRightLeft size={11} color="#5B34B0" />
                <Text style={s.movedTagText}>{moved === u.items.length ? 'Moved here by the office' : `${moved} moved here by the office`}</Text>
              </View>
            ) : null}
          </>
        );
      })()}
      <View style={s.thumbs}>
        {shown.map((m, i) => {
          const uri = isVideo(m) ? null : resolveMediaUrl(m.url);
          const mSent = u.sent_ids.includes(m.id);
          return (
            <TouchableOpacity key={m.id} style={s.thumb} activeOpacity={0.85} onPress={() => { tap(); onOpen(i); }}
              accessibilityRole="imagebutton" accessibilityLabel={`${updateTitle(u)} photo ${i + 1}, ${mSent ? 'sent' : 'not sent'}`}>
              {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : (
                <View style={[StyleSheet.absoluteFill, s.thumbEmpty, isVideo(m) && { backgroundColor: INK }]}>
                  {isVideo(m) ? <Play size={16} color={Colors.white} fill={Colors.white} /> : <ImageOff size={16} color="#A1A1AA" />}
                </View>
              )}
              <View style={[s.tick, { backgroundColor: mSent ? WA : '#B45309' }]}>
                {mSent ? <CheckCheck size={10} color={Colors.white} strokeWidth={3} /> : <Clock3 size={10} color={Colors.white} strokeWidth={3} />}
              </View>
              {i === shown.length - 1 && extra > 0 ? <View style={s.more}><Text style={s.moreText}>+{extra}</Text></View> : null}
            </TouchableOpacity>
          );
        })}
        {timeState ? (
          <TouchableOpacity style={[s.timeState, timeState === 'confirmed' ? s.timeOk : s.timeTodo]} onPress={() => { tap(); onCheckTime?.(); }} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel={timeState === 'confirmed' ? 'Time confirmed. Open Check times' : 'Time needs confirming. Check it'}>
            {timeState === 'confirmed' ? <CircleCheck size={15} color="#15803D" /> : <Clock3 size={15} color="#8A5200" />}
            <View style={{ flexShrink: 1 }}>
              <Text style={[s.timeStateTitle, { color: timeState === 'confirmed' ? '#15803D' : '#8A5200' }]}>
                {timeState === 'confirmed' ? 'Time confirmed' : 'Time to confirm'}
              </Text>
              <Text style={s.timeStateSub}>{timeState === 'confirmed' ? 'Checked on the screenshot' : 'Tap to check it'}</Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={s.setFoot}>
        {sent ? <CheckCheck size={14} color={WA} strokeWidth={2.5} /> : <Clock3 size={14} color="#B45309" strokeWidth={2.4} />}
        <Text style={[s.setStatus, { color: sent ? WA_INK : '#8A5200' }]} numberOfLines={2}>{status.text}</Text>
        <TouchableOpacity style={[s.setSend, sent && s.setSendAgain]} onPress={() => { tap(); onSend(); }} hitSlop={6}
          accessibilityLabel={status.state === 'partial' ? 'Send more on WhatsApp' : sent ? 'Send again on WhatsApp' : 'Send on WhatsApp'}>
          <MessageCircle size={13} color={sent ? WA_INK : Colors.white} strokeWidth={2.4} />
          <Text style={[s.setSendText, sent && { color: WA_INK }]}>{status.state === 'partial' ? 'More' : sent ? 'Again' : 'Send'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backNote: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginHorizontal: 8, marginTop: 4, marginBottom: 6, padding: 10, borderRadius: 12, backgroundColor: '#F5F2FD' },
  backNoteTitle: { fontSize: 12, fontWeight: '800', color: '#4A2A93' },
  backNoteText: { fontSize: 13, color: INK, marginTop: 1, lineHeight: 18 },
  restore: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: '#FFFFFF', borderRadius: 999, borderWidth: 1, borderColor: '#D9CFF5', paddingHorizontal: 10, paddingVertical: 4 },
  restoreText: { fontSize: 12, fontWeight: '800', color: '#4A2A93' },
  timeGrid: { flexDirection: 'row', gap: 6, marginTop: 8 },
  timeCell: { flex: 1, backgroundColor: '#F6F7F9', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  timeLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: '#8A8A96' },
  timeValue: { fontSize: 14, fontWeight: '700', color: INK, marginTop: 1, fontVariant: ['tabular-nums'] },
  timeDay: { fontSize: 11, fontWeight: '600', color: '#8A8A96', marginTop: 1 },
  timeNote: { fontSize: 13, color: MUTED, marginTop: 6 },
  setMeta: { fontSize: 12, color: MUTED, marginTop: -2, marginBottom: 6 },
  movedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#F5F2FD', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 },
  movedTagText: { fontSize: 11, fontWeight: '700', color: '#5B34B0' },
  muted: { fontSize: 12, color: MUTED, marginTop: 2 },
  legHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 2 },
  legHeadGap: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#ECECEF' },
  legHeadText: { flex: 1, fontSize: 12, fontWeight: '800', color: MUTED, letterSpacing: 0.2 },
  row: { flexDirection: 'row', gap: 12, paddingTop: 8, marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 14 },
  rowNext: { backgroundColor: '#F3F6FD' },
  rowFocus: { backgroundColor: '#FFF4E5' },
  rail: { alignItems: 'center', width: 26 },
  bubble: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  bubbleNext: { shadowColor: '#2F5FD0', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 3 },
  bubbleText: { fontSize: 12, fontWeight: '800', color: MUTED },
  line: { flex: 1, width: 2, marginTop: 4, borderRadius: 1 },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: INK },
  delay: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 7, backgroundColor: '#FDEDEB', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  delayText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#912018' },
  hints: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFF6E5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#F5D9A3' },
  hintText: { fontSize: 12, fontWeight: '700', color: '#8A5200' },
  links: { flexDirection: 'row', gap: 16, marginTop: 7 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: 12, fontWeight: '700', color: '#2449A8' },
  tools: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 },
  tool: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F1F3F7' },
  toolText: { fontSize: 13.5, fontWeight: '700', color: INK },
  timesBar: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4, marginBottom: 6, backgroundColor: '#FFF6E5', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 10, borderWidth: 1, borderColor: '#F5D9A3' },
  timesText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#8A5200' },
  timesCta: { fontSize: 13, fontWeight: '800', color: '#8A5200' },
  purged: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4, marginBottom: 4, backgroundColor: '#F2F3F6', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  purgedText: { flex: 1, fontSize: 12, fontWeight: '600', color: MUTED },
  set: { marginTop: 8, borderRadius: 12, padding: 9, gap: 8, borderWidth: 1 },
  setSent: { backgroundColor: '#F4FBF6', borderColor: WA_LIGHT },
  setUnsent: { backgroundColor: '#FFFAF0', borderColor: '#F5D9A3' },
  setTitle: { fontSize: 12, fontWeight: '700', color: INK },
  // Wraps: next to one or two photos the time chip fills the space beside them; with more it drops to its own line.
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  timeState: { flexGrow: 1, flexBasis: 150, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1 },
  timeOk: { backgroundColor: '#ECFDF3', borderColor: '#ABEFC6' },
  timeTodo: { backgroundColor: '#FFF6E5', borderColor: '#F5D9A3' },
  timeStateTitle: { fontSize: 12.5, fontWeight: '800' },
  timeStateSub: { fontSize: 11, color: MUTED, marginTop: 1 },
  transitWrap: { position: 'absolute', top: '50%', left: -24, width: 50, alignItems: 'center', marginTop: -11 },
  // Plain grey text breaking the line, like iMile's "2.8h".
  transitPill: { fontSize: 12, fontWeight: '600', color: '#8A8A96', backgroundColor: Colors.white, paddingHorizontal: 2, paddingVertical: 3, fontVariant: ['tabular-nums'] },
  thumb: { width: 60, height: 60, borderRadius: 10, overflow: 'hidden', backgroundColor: '#E4E7EE' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E4E7EE' },
  tick: { position: 'absolute', right: 4, bottom: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.white },
  more: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(62,60,61,0.6)', alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  setFoot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setStatus: { flex: 1, fontSize: 12, fontWeight: '600' },
  setSend: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 8, backgroundColor: WA },
  setSendAgain: { backgroundColor: WA_LIGHT },
  setSendText: { fontSize: 12, fontWeight: '800', color: Colors.white },
});
