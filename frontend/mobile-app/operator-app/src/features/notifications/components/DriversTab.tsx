/**
 * "From drivers": the photo / video sets drivers sent (loading, arrival,
 * stop, proof of delivery, delay), newest first. Sets with something the
 * customer hasn't had yet come first under "To send"; Send opens the trip
 * with its share sheet on that set, so the WhatsApp message and the "sent"
 * record are the same as from the trip page. Sets already passed on sit
 * under "Sent".
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { CheckCheck, ImageOff, MessageCircle, Play, TriangleAlert, Camera } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import type { DriverUpdate, LiveMediaItem } from '../../../lib/operator';
import { STAGE_TITLE, durationText } from '../../dashboard/actions/actionModel';
import { niceName } from '../../trips/create/components/ui';
import { EmptyState, SectionLabel, SkeletonCard, INK, LINE, MUTED, p, tap } from './parts';

const WA = '#16A34A';
const THUMBS = 4;
const RECIPIENT: Record<string, string> = { customer_group: 'customer group', customer_contact: 'customer', internal: 'our team', other: 'another number' };

const isVideo = (m: LiveMediaItem) => m.kind === 'video' || !!m.mime?.startsWith('video/');

function countLabel(list: LiveMediaItem[]): string {
  const videos = list.filter(isVideo).length;
  if (videos === list.length) return `${list.length} video${list.length === 1 ? '' : 's'}`;
  if (videos === 0) return `${list.length} photo${list.length === 1 ? '' : 's'}`;
  return `${list.length} items`;
}

export function DriversTab({ updates, loading, now, refreshing, onRefresh, onSend, onOpenTrip }: {
  updates: DriverUpdate[];
  loading: boolean;
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
  /** Opens the trip with the share sheet on this set. */
  onSend: (u: DriverUpdate) => void;
  onOpenTrip: (tripId: string) => void;
}) {
  const { toSend, sent } = useMemo(() => {
    const newest = [...updates].sort((a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime());
    return { toSend: newest.filter((u) => u.unsent_count > 0), sent: newest.filter((u) => u.unsent_count === 0) };
  }, [updates]);

  const ago = (iso: string) => {
    const min = (now - new Date(iso).getTime()) / 60000;
    return min < 1 ? 'just now' : `${durationText(min)} ago`;
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 120, paddingHorizontal: 16, gap: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FA634E" />}
    >
      {loading && updates.length === 0 ? (
        <SkeletonCard rows={3} />
      ) : updates.length === 0 ? (
        <EmptyState icon={Camera} title="No driver updates yet" text="Photos and videos drivers take at loading, stops and delivery show up here." />
      ) : (
        <>
          {toSend.length === 0 ? (
            <View style={[p.card, s.done]}>
              <CheckCheck size={18} color={WA} strokeWidth={2.4} />
              <Text style={s.doneText}>Everything drivers sent has been passed on</Text>
            </View>
          ) : (
            <View>
              <SectionLabel title="To send" count={toSend.length} />
              <View style={{ gap: 10 }}>
                {toSend.map((u) => <UpdateCard key={`${u.trip.id}:${u.key}`} u={u} when={ago(u.latest_at)} onSend={onSend} onOpenTrip={onOpenTrip} />)}
              </View>
            </View>
          )}

          {sent.length ? (
            <View>
              <SectionLabel title="Sent" count={sent.length} />
              <View style={p.card}>
                {sent.map((u, i) => <SentRow key={`${u.trip.id}:${u.key}`} u={u} first={i === 0} when={ago(u.latest_at)} onOpenTrip={onOpenTrip} />)}
              </View>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function Thumb({ m, size, more }: { m: LiveMediaItem; size: number; more?: number }) {
  const uri = isVideo(m) ? null : resolveMediaUrl(m.url);
  return (
    <View style={[s.thumb, { width: size, height: size }]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : (
        <View style={[StyleSheet.absoluteFill, s.thumbEmpty, isVideo(m) && { backgroundColor: INK }]}>
          {isVideo(m) ? <Play size={16} color={Colors.white} fill={Colors.white} /> : <ImageOff size={16} color="#A1A1AA" />}
        </View>
      )}
      {more ? <View style={s.more}><Text style={s.moreText}>+{more}</Text></View> : null}
    </View>
  );
}

function UpdateCard({ u, when, onSend, onOpenTrip }: { u: DriverUpdate; when: string; onSend: (u: DriverUpdate) => void; onOpenTrip: (id: string) => void }) {
  const unsent = u.items.filter((m) => !u.sent_ids.includes(m.id));
  const shown = unsent.slice(0, THUMBS);
  const extra = unsent.length - shown.length;
  const title = STAGE_TITLE[u.stage] ?? 'Photos';
  const where = u.stop?.name ? niceName(u.stop.name) : null;
  const crew = [u.vehicle_plate, u.driver ? niceName(u.driver.name) : null].filter(Boolean).join(' · ');
  const to = u.customer?.group_name || niceName(u.customer?.name) || 'customer';
  const partSent = u.sent_ids.length > 0;

  return (
    <TouchableOpacity style={[p.card, s.card]} onPress={() => { tap(); onOpenTrip(u.trip.id); }} activeOpacity={0.85}
      accessibilityRole="button" accessibilityLabel={`${title}, ${u.trip.ref_id ?? ''}, ${countLabel(unsent)} to send`}>
      <View style={s.head}>
        <View style={[s.stage, u.stage === 'delay' && { backgroundColor: '#FEF3F2' }]}>
          {u.stage === 'delay' ? <TriangleAlert size={16} color="#D92D20" strokeWidth={2.3} /> : <Camera size={16} color={INK} strokeWidth={2.2} />}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={s.title} numberOfLines={1}>{title}{where ? ` · ${where}` : ''}</Text>
          <Text style={s.meta} numberOfLines={1}>{[u.trip.ref_id, niceName(u.customer?.name)].filter(Boolean).join(' · ')}</Text>
        </View>
        <Text style={s.when}>{when}</Text>
      </View>

      <View style={s.thumbs}>
        {shown.map((m, i) => <Thumb key={m.id} m={m} size={64} more={i === shown.length - 1 && extra > 0 ? extra : undefined} />)}
      </View>

      {u.delay_note ? <Text style={s.note} numberOfLines={2}>“{u.delay_note}”</Text> : null}

      <View style={s.foot}>
        <View style={{ flex: 1 }}>
          <Text style={s.count}>{countLabel(unsent)} new{partSent ? ` · ${u.sent_ids.length} sent before` : ''}</Text>
          {crew ? <Text style={s.meta} numberOfLines={1}>{crew}</Text> : null}
        </View>
        <TouchableOpacity style={s.send} onPress={() => { tap(); onSend(u); }} hitSlop={6} accessibilityLabel={`Send to ${to}`}>
          <MessageCircle size={15} color={Colors.white} strokeWidth={2.4} />
          <Text style={s.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function SentRow({ u, first, when, onOpenTrip }: { u: DriverUpdate; first: boolean; when: string; onOpenTrip: (id: string) => void }) {
  const last = [...u.shares].sort((a, b) => new Date(b.shared_at).getTime() - new Date(a.shared_at).getTime())[0];
  const cover = u.items[0];
  return (
    <TouchableOpacity style={[s.row, !first && p.rowBorder]} onPress={() => { tap(); onOpenTrip(u.trip.id); }} activeOpacity={0.6}>
      {cover ? <Thumb m={cover} size={40} /> : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{STAGE_TITLE[u.stage] ?? 'Photos'} · {u.trip.ref_id ?? ''}</Text>
        <Text style={s.meta} numberOfLines={1}>
          {countLabel(u.items)}{last ? ` · to ${RECIPIENT[last.recipient] ?? 'customer'}${last.shared_by ? ` by ${niceName(last.shared_by)}` : ''}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <CheckCheck size={16} color={WA} strokeWidth={2.4} />
        <Text style={s.when}>{when}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  done: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  doneText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#15803D' },

  card: { padding: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stage: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: INK },
  meta: { fontSize: 12, color: MUTED },
  when: { fontSize: 12, color: MUTED, fontVariant: ['tabular-nums'] },
  thumbs: { flexDirection: 'row', gap: 6 },
  thumb: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#E4E7EE' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E4E7EE' },
  more: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(62,60,61,0.6)', alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  note: { fontSize: 13, color: '#B42318', lineHeight: 18 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#F1F1F3', paddingTop: 10 },
  count: { fontSize: 13, fontWeight: '600', color: INK },
  send: { height: 36, paddingHorizontal: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: WA },
  sendText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderColor: LINE },
  rowTitle: { fontSize: 14, fontWeight: '600', color: INK },
});
