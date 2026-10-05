/**
 * WhatsApp from the Fleet map, in the one shared status format.
 *
 *   ShareKindSheet    what to send about the picked truck: status update,
 *                     its location, or a delay notice.
 *   TripShareFromMap  the trip page's own share sheet (same message, same
 *                     recipients: customer group / contact, driver, our team,
 *                     another number) for the truck's trip.
 *   BulkStatusSheet   several picked trucks → one message per customer
 *                     (statusShare.ts), each sent to that customer's WhatsApp
 *                     number or group, or all of them as one message (our team).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, Clock3, MapPin, MessageCircle, Users } from 'lucide-react-native';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { ShareSheet, type ShareTarget } from '../trips/details/components/ShareSheet';
import { useTripDetails } from '../trips/details/useTripDetails';
import { makeFormatters, waLink, type QuickKind } from '../trips/details/tripDetailsModel';
import { shareTextToWhatsApp } from '../dashboard/components/ActiveTripsSection';
import { buildStatusMessages, type CustomerStatusMessage } from '../share/statusShare';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const LINE = '#E9E9EC';
const RED = '#D92D20';
const WA = '#25D366';

export function ShareKindSheet({ visible, title, delayed, onPick, onClose }: {
  visible: boolean; title: string; delayed: boolean; onPick: (kind: QuickKind) => void; onClose: () => void;
}) {
  const rows: { kind: QuickKind; label: string; detail: string; icon: typeof MessageCircle; hot?: boolean }[] = [
    { kind: 'status', label: 'Status update', detail: 'Driver, truck, status, ETA and the live link', icon: MessageCircle },
    { kind: 'location', label: 'Truck location', detail: 'A map pin of where it is now', icon: MapPin },
    { kind: 'delay', label: 'Delay notice', detail: delayed ? 'This trip is running late' : 'With the reason the driver gave', icon: Clock3, hot: delayed },
  ];
  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title={title}>
      <View style={{ gap: 4, paddingBottom: 8 }}>
        {rows.map((r) => (
          <TouchableOpacity key={r.kind} style={s.kindRow} onPress={() => onPick(r.kind)} activeOpacity={0.7}>
            <View style={[s.kindIcon, r.hot && { backgroundColor: '#FDECEA' }]}><r.icon size={18} color={r.hot ? RED : INK} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.kindLabel, r.hot && { color: RED }]}>{r.label}</Text>
              <Text style={s.kindDetail}>{r.detail}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </AppModal>
  );
}

/** The trip page's share sheet, for a trip picked on the map (loads the trip like the trip page does). */
export function TripShareFromMap({ tripId, kind, onClose }: { tripId: string; kind: QuickKind; onClose: () => void }) {
  const d = useTripDetails(tripId);
  const f = useMemo(() => makeFormatters(d.tz), [d.tz]);
  // One object per open, so the sheet doesn't reset its text on every render.
  const target = useMemo<ShareTarget>(() => ({ type: 'quick', kind }), [kind]);
  if (!d.trip || !d.phase) {
    return (
      <AppModal visible onClose={onClose} type="bottom-sheet" title="Preparing message…">
        <View style={{ paddingVertical: 28, alignItems: 'center', gap: 10 }}>
          {d.error ? <Text style={s.kindDetail}>{d.error}</Text> : <ActivityIndicator color={INK} />}
        </View>
      </AppModal>
    );
  }
  const pos = d.overview?.unit?.position;
  return (
    <ShareSheet
      target={target}
      onClose={onClose}
      trip={d.trip}
      phase={d.phase}
      f={f}
      position={pos ? { lat: pos.lat, lng: pos.lng } : null}
      remaining={d.remaining}
      trackingUrl={d.trackingUrl}
      onNeedTracking={d.refreshTracking}
      whatsappApi={d.whatsappApi}
      onShared={d.reload}
    />
  );
}

/** Mounted fresh for each send (the screen keys it by the picked trips). */
export function BulkStatusSheet({ tripIds, positions, onClose }: {
  tripIds: string[];
  positions: Record<string, { lat: number; lng: number } | null>;
  onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<CustomerStatusMessage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  // Built once, with the trips and their live ETAs as they are now.
  useEffect(() => {
    let live = true;
    buildStatusMessages(tripIds, { positions })
      .then((m) => { if (live) setMsgs(m); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keyOf = (m: CustomerStatusMessage) => m.customerId ?? m.customerName;
  const send = (m: CustomerStatusMessage) => {
    Linking.openURL(waLink(m.phone, m.text))
      .then(() => setSent((prev) => new Set(prev).add(keyOf(m))))
      .catch(() => Alert.alert('Could not open WhatsApp'));
  };
  const sendAll = () => {
    if (!msgs?.length) return;
    shareTextToWhatsApp(msgs.map((m) => m.text).join('\n\n───────────────────\n\n'), `${tripIds.length} Vehicle Status Updates`);
  };

  return (
    <AppModal visible onClose={onClose} type="bottom-sheet" title={`Send status · ${tripIds.length} truck${tripIds.length === 1 ? '' : 's'}`} maxHeight="92%">
      {failed ? <Text style={s.empty}>Couldn&apos;t prepare the messages. Check the connection and try again.</Text> : null}
      {!msgs && !failed ? (
        <View style={{ paddingVertical: 28, alignItems: 'center', gap: 10 }}>
          <ActivityIndicator color={INK} />
          <Text style={s.kindDetail}>Loading trips and live ETAs…</Text>
        </View>
      ) : null}
      {msgs ? (
        <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
          {msgs.length > 1 ? <Text style={s.note}>{msgs.length} customers — each gets their own message with only their trucks.</Text> : null}
          {msgs.map((m) => {
            const k = keyOf(m);
            const done = sent.has(k);
            return (
              <View key={k} style={s.card}>
                <View style={s.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.customer} numberOfLines={1}>{m.customerName}</Text>
                    <Text style={s.kindDetail} numberOfLines={1}>
                      {m.tripIds.length} truck{m.tripIds.length === 1 ? '' : 's'} · to {m.phone ?? m.group ?? 'pick the chat in WhatsApp'}
                    </Text>
                  </View>
                  <TouchableOpacity style={[s.send, done && s.sendDone]} onPress={() => send(m)} accessibilityLabel={`Send to ${m.customerName}`}>
                    {done ? <Check size={15} color={INK} /> : <MessageCircle size={15} color="#FFFFFF" />}
                    <Text style={[s.sendText, done && { color: INK }]}>{done ? 'Sent' : 'Send'}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setOpen(open === k ? null : k)} activeOpacity={0.7}>
                  <Text style={s.preview} numberOfLines={open === k ? undefined : 5}>{m.text}</Text>
                  <Text style={s.more}>{open === k ? 'Show less' : 'Show whole message'}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          {msgs.length > 1 ? (
            <TouchableOpacity style={s.all} onPress={sendAll}>
              <Users size={16} color={INK} />
              <Text style={s.allText}>Send all as one message (our team)</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      ) : null}
    </AppModal>
  );
}

const s = StyleSheet.create({
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  kindIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F1F1F3', alignItems: 'center', justifyContent: 'center' },
  kindLabel: { fontSize: 15, fontWeight: '700', color: INK },
  kindDetail: { fontSize: 12, color: MUTED, marginTop: 1 },
  empty: { textAlign: 'center', color: MUTED, paddingVertical: 24, fontSize: 14 },
  note: { fontSize: 12, color: MUTED },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 14, padding: 12, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customer: { fontSize: 15, fontWeight: '700', color: INK },
  send: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, borderRadius: 10, paddingHorizontal: 12, backgroundColor: WA },
  sendDone: { backgroundColor: '#F1F1F3' },
  sendText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  preview: { fontSize: 12, color: '#3F3F46', fontFamily: 'monospace', backgroundColor: '#F6F6F7', borderRadius: 10, padding: 10, lineHeight: 17 },
  more: { fontSize: 12, fontWeight: '600', color: MUTED, marginTop: 4 },
  all: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, borderWidth: 1, borderColor: LINE },
  allText: { fontSize: 14, fontWeight: '600', color: INK },
});
