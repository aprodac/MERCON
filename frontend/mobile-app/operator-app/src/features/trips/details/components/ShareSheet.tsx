/**
 * "Send update": pick who gets it, what goes in, check the message, open
 * WhatsApp. Photo updates are recorded on the server (same call as the web),
 * so every operator sees what was already sent; quick texts (status, ETA,
 * location, delay) just open WhatsApp with the message.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Image, ScrollView, Linking, Alert, Switch } from 'react-native';
import { Check, MessageCircle, Play } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { operatorService, type DriverUpdate, type OperatorTripDetail, type ShareRecipient, type TripPhase } from '../../../../lib/operator';
import { digits, quickMessage, sortedStops, stopName, updateTitle, waLink, type Formatters, type QuickKind, type Remaining } from '../tripDetailsModel';
import { INK, MUTED, WA, tap } from './parts';

export type ShareTarget = { type: 'update'; update: DriverUpdate } | { type: 'quick'; kind: QuickKind };

interface Props {
  target: ShareTarget | null;
  onClose: () => void;
  trip: OperatorTripDetail;
  phase: TripPhase;
  f: Formatters;
  position: { lat: number; lng: number } | null;
  remaining: Remaining | null;
  whatsappApi: boolean;
  onShared: () => void;
}

type Who = 'customer_group' | 'customer_contact' | 'driver' | 'internal' | 'other';

const QUICK_TITLE: Record<QuickKind, string> = { status: 'Send status', eta: 'Send ETA', location: 'Send location', delay: 'Send delay notice' };

export function ShareSheet({ target, onClose, trip, phase, f, position, remaining, whatsappApi, onShared }: Props) {
  const customerPhone = trip.customer?.whatsapp_number || trip.customer?.contact_phone || null;
  const driverPhone = trip.is_third_party ? trip.third_party_driver_phone : trip.driver?.phone_primary;
  const update = target?.type === 'update' ? target.update : null;

  const [who, setWho] = useState<Who>('customer_group');
  const [otherPhone, setOtherPhone] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [withNext, setWithNext] = useState(true);
  const [asImages, setAsImages] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const stops = sortedStops(trip);
  const nextIdx = stops.findIndex((s) => !s.actual_arrival);
  const nextLine = phase === 'active' && nextIdx >= 0
    ? `Next: ${stopName(stops[nextIdx], nextIdx)}${stops[nextIdx].planned_arrival ? ` · due ${f.smart(stops[nextIdx].planned_arrival)}` : ''}`
    : null;

  // Reset every time the sheet opens for something new.
  const [shownFor, setShownFor] = useState<ShareTarget | null>(null);
  if (target !== shownFor) {
    setShownFor(target);
    if (target) resetFor(target);
  }

  function resetFor(target: ShareTarget) {
    setWho(trip.customer?.whatsapp_group_name || !customerPhone ? 'customer_group' : 'customer_contact');
    setOtherPhone('');
    setAsImages(false);
    setWithNext(true);
    if (target.type === 'update') {
      const unsent = target.update.items.filter((m) => !target.update.sent_ids.includes(m.id)).map((m) => m.id);
      setChosen(new Set(unsent.length ? unsent : target.update.items.map((m) => m.id)));
      setText('');
    } else {
      setText(quickMessage(target.kind, { trip, phase, f, position, remaining }));
    }
  }

  const options = useMemo(() => {
    const o: { id: Who; label: string; detail: string; phone: string | null }[] = [
      { id: 'customer_group', label: trip.customer?.whatsapp_group_name || 'Customer group', detail: 'Pick the group in WhatsApp', phone: null },
      { id: 'customer_contact', label: trip.customer?.contact_person || 'Customer contact', detail: customerPhone || 'No number saved — type it', phone: customerPhone },
    ];
    if (driverPhone) o.push({ id: 'driver', label: 'Driver', detail: driverPhone, phone: driverPhone });
    o.push({ id: 'internal', label: 'Our team group', detail: 'Pick the group in WhatsApp', phone: null });
    o.push({ id: 'other', label: 'Another number', detail: 'Type it below', phone: null });
    return o;
  }, [trip, customerPhone, driverPhone]);

  const current = options.find((o) => o.id === who) ?? options[0];
  const needsNumber = who === 'other' || (who === 'customer_contact' && !customerPhone);
  const phone = needsNumber ? otherPhone.trim() : current.phone;
  const canSendImages = !!update && whatsappApi && !!digits(phone);

  const previewUpdate = update
    ? [
        `*${[trip.ref_id, updateTitle(update)].filter(Boolean).join(' · ')}${update.stop ? ` · ${update.stop.name}` : ''}*`,
        [trip.customer?.name, update.trip.route].filter(Boolean).join(' · '),
        update.delay_note ? `Reason: ${update.delay_note}` : null,
        withNext && nextLine ? nextLine : null,
        `${chosen.size} ${chosen.size === 1 ? 'item' : 'items'}: link added when you send`,
      ].filter(Boolean).join('\n')
    : '';

  const send = async () => {
    if (needsNumber && !digits(otherPhone)) {
      Alert.alert('Enter the WhatsApp number');
      return;
    }
    if (!update) {
      Linking.openURL(waLink(phone, text)).catch(() => Alert.alert('Could not open WhatsApp'));
      onClose();
      return;
    }
    if (chosen.size === 0) {
      Alert.alert('Pick at least one photo');
      return;
    }
    setSending(true);
    try {
      const recipient: ShareRecipient = who === 'driver' ? 'other' : who;
      const r = await operatorService.shareDriverUpdate({
        trip_id: trip.id,
        update_key: update.key,
        media_ids: [...chosen],
        recipient,
        recipient_phone: digits(phone) || null,
        channel: asImages && canSendImages ? 'whatsapp_api' : 'link',
      });
      onShared();
      if (r.sent_via_api) {
        Alert.alert('Sent', `${chosen.size} ${chosen.size === 1 ? 'item' : 'items'} sent to ${phone}.`);
      } else {
        const message = withNext && nextLine ? `${r.text}\n${nextLine}` : r.text;
        await Linking.openURL(waLink(phone, message)).catch(() => Alert.alert('Could not open WhatsApp', message));
      }
      onClose();
    } catch (e) {
      Alert.alert('Could not send', getApiErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const toggle = (id: string) => {
    tap();
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <AppModal visible={!!target} onClose={onClose} type="bottom-sheet" title={update ? `Send · ${updateTitle(update)}` : target?.type === 'quick' ? QUICK_TITLE[target.kind] : ''} maxHeight="92%">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
        <Text style={s.label}>To</Text>
        <View style={{ gap: 6 }}>
          {options.map((o) => {
            const on = o.id === who;
            return (
              <TouchableOpacity key={o.id} style={[s.opt, on && s.optOn]} activeOpacity={0.8} onPress={() => { tap(); setWho(o.id); }}>
                <View style={[s.radio, on && s.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.optLabel} numberOfLines={1}>{o.label}</Text>
                  <Text style={s.optDetail} numberOfLines={1}>{o.detail}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        {needsNumber ? (
          <TextInput
            style={s.input}
            value={otherPhone}
            onChangeText={setOtherPhone}
            placeholder="+966 5x xxx xxxx"
            placeholderTextColor="#9898A4"
            keyboardType="phone-pad"
          />
        ) : null}

        {update ? (
          <>
            <Text style={s.label}>Photos · {chosen.size} of {update.items.length}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {update.items.map((m) => {
                const on = chosen.has(m.id);
                const uri = resolveMediaUrl(m.url);
                return (
                  <TouchableOpacity key={m.id} onPress={() => toggle(m.id)} activeOpacity={0.85} style={[s.pick, on && s.pickOn]}>
                    {m.kind === 'video' || !uri ? (
                      <View style={[s.pickImg, { backgroundColor: INK, alignItems: 'center', justifyContent: 'center' }]}><Play size={16} color={Colors.white} fill={Colors.white} /></View>
                    ) : <Image source={{ uri }} style={s.pickImg} />}
                    <View style={[s.pickCheck, on && { backgroundColor: WA, borderColor: WA }]}>
                      {on ? <Check size={11} color={Colors.white} strokeWidth={3.5} /> : null}
                    </View>
                    {update.sent_ids.includes(m.id) ? <Text style={s.pickSent}>Sent</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {nextLine ? (
              <View style={s.switchRow}>
                <Text style={s.switchText}>Add next stop & time</Text>
                <Switch value={withNext} onValueChange={setWithNext} trackColor={{ true: WA }} />
              </View>
            ) : null}
            {canSendImages ? (
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchText}>Send as real images</Text>
                  <Text style={s.optDetail}>Through WhatsApp Business, straight to {phone}</Text>
                </View>
                <Switch value={asImages} onValueChange={setAsImages} trackColor={{ true: WA }} />
              </View>
            ) : null}
            <Text style={s.label}>Preview</Text>
            <View style={s.chat}><Text style={s.bubble}>{previewUpdate}</Text></View>
          </>
        ) : (
          <>
            <Text style={s.label}>Message</Text>
            <TextInput style={[s.input, s.message]} value={text} onChangeText={setText} multiline textAlignVertical="top" />
          </>
        )}

        <TouchableOpacity style={[s.sendBtn, sending && { opacity: 0.7 }]} activeOpacity={0.85} onPress={send} disabled={sending}>
          <MessageCircle size={19} color={Colors.white} strokeWidth={2.3} />
          <Text style={s.sendText}>{sending ? 'Preparing…' : asImages && canSendImages ? 'Send images' : 'Open WhatsApp'}</Text>
        </TouchableOpacity>
        {update ? <Text style={[s.optDetail, { textAlign: 'center' }]}>Marked as sent for everyone, so nothing goes out twice</Text> : null}
      </ScrollView>
    </AppModal>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '800', color: '#3B3B44' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11, borderRadius: 14, borderWidth: 1.5, borderColor: '#EEF0F4' },
  optOn: { borderColor: WA, backgroundColor: '#F2FBF5' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#B8BCC8' },
  radioOn: { borderWidth: 6, borderColor: WA },
  optLabel: { fontSize: 14, fontWeight: '700', color: INK },
  optDetail: { fontSize: 12, color: MUTED },
  input: { minHeight: 46, borderRadius: 12, backgroundColor: '#F5F6F9', paddingHorizontal: 12, fontSize: 14, color: INK },
  message: { minHeight: 150, paddingTop: 12, lineHeight: 20 },
  pick: { width: 68, height: 68, borderRadius: 12, overflow: 'hidden', borderWidth: 2.5, borderColor: 'transparent' },
  pickOn: { borderColor: WA },
  pickImg: { width: '100%', height: '100%' },
  pickCheck: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.white, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  pickSent: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,20,26,0.55)', color: Colors.white, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  switchText: { fontSize: 14, fontWeight: '600', color: INK },
  chat: { backgroundColor: '#E9E2D6', borderRadius: 16, padding: 12 },
  bubble: { backgroundColor: '#D9FDD3', borderRadius: 12, borderBottomRightRadius: 4, padding: 10, marginLeft: 30, fontSize: 13, lineHeight: 19, color: INK },
  sendBtn: { height: 52, borderRadius: 14, backgroundColor: WA, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  sendText: { color: Colors.white, fontSize: 16, fontWeight: '800' },
});
