/**
 * The WhatsApp tab: quick sends (status, ETA, location, delay) and every
 * photo / video update from the driver, each with Send and who already sent it.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native';
import { ArrowRight, CheckCheck, Clock3, ImagePlus, MapPin, Play, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import type { DriverUpdate, OperatorTripDetail, TripPhase } from '../../../../lib/operator';
import { ago, recipientLabel, sortedStops, updateTitle, type Formatters, type QuickKind } from '../tripDetailsModel';
import { Card, Chip, INK, MUTED, WA, tap } from './parts';

interface Props {
  trip: OperatorTripDetail;
  phase: TripPhase;
  updates: DriverUpdate[];
  f: Formatters;
  onQuick: (kind: QuickKind) => void;
  onSendUpdate: (u: DriverUpdate) => void;
  onOpenMedia: (u: DriverUpdate, index: number) => void;
  onAddPhoto: () => void;
}

const QUICK: { kind: QuickKind; label: string; icon: LucideIcon; bg: string; fg: string }[] = [
  { kind: 'status', label: 'Status', icon: ArrowRight, bg: '#E7EEFC', fg: '#2449A8' },
  { kind: 'eta', label: 'ETA', icon: Clock3, bg: '#F0EBFC', fg: '#5B34B0' },
  { kind: 'location', label: 'Location', icon: MapPin, bg: '#FDECE8', fg: '#B43A27' },
  { kind: 'delay', label: 'Delay', icon: TriangleAlert, bg: '#FFF3D6', fg: '#7A4F00' },
];

export function UpdatesTab({ trip, phase, updates, f, onQuick, onSendUpdate, onOpenMedia, onAddPhoto }: Props) {
  const feed = [...updates].sort((a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime());
  const stops = sortedStops(trip);
  const quick = QUICK.filter((q) => !(phase !== 'active' && (q.kind === 'location' || q.kind === 'delay')));

  return (
    <View style={{ gap: 10 }}>
      <Text style={s.label}>Quick send</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {quick.map((q) => (
          <TouchableOpacity key={q.kind} style={s.quick} activeOpacity={0.75} onPress={() => { tap(); onQuick(q.kind); }}>
            <View style={[s.quickIcon, { backgroundColor: q.bg }]}>
              <q.icon size={18} color={q.fg} strokeWidth={2.3} />
            </View>
            <Text style={s.quickText}>{q.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.quick} activeOpacity={0.75} onPress={onAddPhoto}>
          <View style={[s.quickIcon, { backgroundColor: '#E8F5EE' }]}>
            <ImagePlus size={18} color="#146C3C" strokeWidth={2.2} />
          </View>
          <Text style={s.quickText}>Add photo</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={s.feedHead}>
        <Text style={s.label}>From the driver</Text>
        {feed.length > 0 ? <Text style={s.muted}>newest first</Text> : null}
      </View>

      {feed.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 22 }}>
          <ImagePlus size={24} color={MUTED} />
          <Text style={s.emptyTitle}>No photos from the driver yet</Text>
          <Text style={[s.muted, { textAlign: 'center' }]}>Loading, arrival and delivery photos show up here, ready to send on WhatsApp.</Text>
        </Card>
      ) : (
        feed.map((u) => {
          const stopIdx = u.stop ? stops.findIndex((st) => st.id === u.stop!.id) : -1;
          const where = u.stop?.name || (stopIdx >= 0 ? stops[stopIdx].location_name : null) || 'Trip';
          const last = u.shares[0];
          const unsent = u.unsent_count;
          const delivered = u.stage === 'delivered';
          return (
            <Card key={u.key} style={[{ gap: 10 }, unsent > 0 && delivered && s.highlight]}>
              <View style={s.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{updateTitle(u)}</Text>
                  <Text style={s.muted} numberOfLines={1}>{where} · {f.smart(u.latest_at)}</Text>
                </View>
                {unsent > 0 ? <Chip label={unsent < u.items.length ? `${unsent} new` : `${u.items.length} to send`} tone={u.stage === 'delay' ? 'red' : 'green'} /> : null}
              </View>

              {u.delay_note ? <Text style={s.note}>“{u.delay_note}”</Text> : null}

              <View style={s.thumbs}>
                {u.items.slice(0, 4).map((m, i) => {
                  const more = i === 3 && u.items.length > 4 ? u.items.length - 3 : 0;
                  const uri = resolveMediaUrl(m.url);
                  const sent = u.sent_ids.includes(m.id);
                  return (
                    <TouchableOpacity key={m.id} activeOpacity={0.85} onPress={() => onOpenMedia(u, i)} style={s.thumb} accessibilityLabel={m.kind === 'video' ? 'Play video' : 'View photo'}>
                      {m.kind === 'video' || !uri ? (
                        <View style={[s.thumbFill, { backgroundColor: INK, alignItems: 'center', justifyContent: 'center' }]}>
                          <Play size={16} color={Colors.white} fill={Colors.white} />
                        </View>
                      ) : (
                        <Image source={{ uri }} style={s.thumbFill} />
                      )}
                      {sent && !more ? <View style={s.sentTag}><Text style={s.sentTagText}>Sent</Text></View> : null}
                      {more ? <View style={s.more}><Text style={s.moreText}>+{more}</Text></View> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={s.cardFoot}>
                {last ? (
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <CheckCheck size={14} color="#146C3C" />
                    <Text style={s.sentText} numberOfLines={2}>
                      Sent to {recipientLabel(last.recipient)}{last.shared_by ? ` · ${last.shared_by}` : ''} · {ago(last.shared_at)}
                    </Text>
                  </View>
                ) : (
                  <Text style={[s.muted, { flex: 1 }]}>Not sent yet</Text>
                )}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => onSendUpdate(u)}
                  style={unsent > 0 ? s.send : s.again}
                >
                  <Text style={unsent > 0 ? s.sendText : s.againText}>{unsent > 0 ? (last ? `Send ${unsent} new` : 'Send') : 'Send again'}</Text>
                </TouchableOpacity>
              </View>
            </Card>
          );
        })
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '800', color: '#3B3B44' },
  muted: { fontSize: 12, color: MUTED },
  feedHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  quick: { width: 76, alignItems: 'center', gap: 6, backgroundColor: Colors.white, borderRadius: 16, paddingVertical: 10 },
  quickIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 11, fontWeight: '800', color: INK },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: INK },
  highlight: { borderWidth: 1.5, borderColor: '#9FD8B6' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '800', color: INK },
  note: { fontSize: 13, color: INK, backgroundColor: '#F7F8FA', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  thumbs: { flexDirection: 'row', gap: 6 },
  thumb: { flex: 1, maxWidth: '24%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E4E7EE' },
  thumbFill: { width: '100%', height: '100%' },
  sentTag: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,20,26,0.55)', paddingVertical: 1 },
  sentTagText: { color: Colors.white, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  more: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,20,26,0.55)', alignItems: 'center', justifyContent: 'center' },
  moreText: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sentText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#146C3C' },
  send: { height: 38, borderRadius: 11, backgroundColor: WA, paddingHorizontal: 14, justifyContent: 'center' },
  sendText: { color: Colors.white, fontSize: 13, fontWeight: '800' },
  again: { height: 38, borderRadius: 11, backgroundColor: '#F1F3F7', paddingHorizontal: 12, justifyContent: 'center' },
  againText: { color: INK, fontSize: 12, fontWeight: '700' },
});
