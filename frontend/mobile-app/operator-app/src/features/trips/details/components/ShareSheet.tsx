/**
 * "Send update": pick who gets it, what goes in, check the message, open
 * WhatsApp. Photo updates are recorded on the server (same call as the web),
 * so every operator sees what was already sent; quick texts (status, ETA,
 * location, delay, assignment) just open WhatsApp with the message.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Image, ScrollView, Linking, Alert, Switch, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Check, MessageCircle, Play } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { operatorService, type DriverUpdate, type OperatorTripDetail, type ShareRecipient, type TripPhase } from '../../../../lib/operator';
import { customerContacts, digits, quickMessage, sortedStops, stopName, updateTitle, waLink, withTag, type Formatters, type QuickKind, type Remaining, type TagPerson } from '../tripDetailsModel';
import { INK, MUTED, WA, tap } from './parts';
import { shareMediaFiles } from '../shareMedia';
import { batchMessage, batchSingle, loadBatch, type Batch } from '../assignmentBatch';

export type ShareTarget = { type: 'update'; update: DriverUpdate } | { type: 'quick'; kind: QuickKind };

interface Props {
  target: ShareTarget | null;
  onClose: () => void;
  trip: OperatorTripDetail;
  phase: TripPhase;
  f: Formatters;
  position: { lat: number; lng: number } | null;
  remaining: Remaining | null;
  trackingUrl: string | null;
  /** Fetch the tracking link again when it's missing. */
  onNeedTracking?: () => void;
  whatsappApi: boolean;
  onShared: () => void;
}

type Who = 'customer_group' | 'customer_contact' | 'driver' | 'internal' | 'other';

const QUICK_TITLE: Record<QuickKind, string> = { status: 'Send status', eta: 'Send ETA', location: 'Send location', delay: 'Send delay notice', assignment: 'Send assignment' };

export function ShareSheet({ target, onClose, trip, phase, f, position, remaining, trackingUrl, onNeedTracking, whatsappApi, onShared }: Props) {
  const customerPhone = trip.customer?.whatsapp_number || trip.customer?.contact_phone || null;
  const driverPhone = trip.is_third_party ? trip.third_party_driver_phone : trip.driver?.phone_primary;
  const update = target?.type === 'update' ? target.update : null;

  const [who, setWho] = useState<Who>('customer_group');
  const [otherPhone, setOtherPhone] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [withNext, setWithNext] = useState(true);
  const [viaCompany, setViaCompany] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Assignment message: who at the customer gets @tagged — a saved contact, someone typed in, or nobody.
  const contacts = useMemo(() => customerContacts(trip), [trip]);
  const [tagPick, setTagPick] = useState<number | 'none' | 'other'>(0);
  const [otherTag, setOtherTag] = useState('');
  const isAssignment = target?.type === 'quick' && target.kind === 'assignment';
  const tag: TagPerson | null = !isAssignment
    ? null
    : tagPick === 'other' ? (otherTag.trim() ? { name: otherTag.trim() } : null)
    : tagPick === 'none' ? null
    : contacts[tagPick] ?? null;

  // Several trips from one Create Trip (`batch` = their ids, set by the "Trip created" sheet):
  // one numbered message for all, or one message per trip sent in a row.
  const { batch } = useLocalSearchParams<{ batch?: string }>();
  const batchIds = useMemo(() => (batch ?? '').split(',').filter(Boolean), [batch]);
  const isBatch = isAssignment && batchIds.length > 1;
  const [batchData, setBatchData] = useState<Batch | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [oneByOne, setOneByOne] = useState(false);
  const [step, setStep] = useState(0);

  const stops = sortedStops(trip);
  const nextIdx = stops.findIndex((s) => !s.actual_arrival);
  const nextLine = phase === 'active' && nextIdx >= 0
    ? `Next: ${stopName(stops[nextIdx], nextIdx)}${stops[nextIdx].planned_arrival ? ` · due ${f.smart(stops[nextIdx].planned_arrival)}` : ''}`
    : null;

  // The last message written for the operator — declared before the reset
  // below, which runs during render and sets it.
  const generated = useRef('');

  // Reset every time the sheet opens for something new.
  const [shownFor, setShownFor] = useState<ShareTarget | null>(null);
  if (target !== shownFor) {
    setShownFor(target);
    if (target) resetFor(target);
  }

  function resetFor(target: ShareTarget) {
    setWho(trip.customer?.whatsapp_group_name || !customerPhone ? 'customer_group' : 'customer_contact');
    setOtherPhone('');
    setTagPick(contacts.length ? 0 : 'none');
    setOtherTag('');
    setViaCompany(true);
    setWithNext(true);
    if (target.type === 'update') {
      const unsent = target.update.items.filter((m) => !target.update.sent_ids.includes(m.id)).map((m) => m.id);
      setChosen(new Set(unsent.length ? unsent : target.update.items.map((m) => m.id)));
      setText('');
    } else {
      const first = target.kind === 'assignment' && contacts.length ? contacts[0] : null;
      setOneByOne(false);
      setStep(0);
      // Batch: the message is written once the trips have loaded.
      const msg = target.kind === 'assignment' && batchIds.length > 1
        ? (batchData ? batchMessage(batchData, f, first) : '')
        : quickMessage(target.kind, { trip, phase, f, position, remaining, trackingUrl, tag: first });
      generated.current = msg;
      setText(msg);
    }
  }

  // The tracking link (and the distance / ETA) can arrive after the sheet opened —
  // rewrite the message with them, unless the operator has already edited it.
  useEffect(() => {
    if (!target || target.type !== 'quick' || isBatch) return;
    if (text !== generated.current) return;
    const msg = quickMessage(target.kind, { trip, phase, f, position, remaining, trackingUrl, tag });
    if (msg !== text) {
      generated.current = msg;
      setText(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingUrl, remaining, position, phase]);

  // Load the batch's trips once; write the numbered message as soon as they arrive.
  useEffect(() => {
    if (!isBatch || batchData) return;
    let live = true;
    loadBatch(batchIds)
      .then((loaded) => {
        if (!live) return;
        setBatchData(loaded);
        const msg = batchMessage(loaded, f, tag);
        generated.current = msg;
        setText(msg);
      })
      .catch((e) => { if (live) setBatchError(getApiErrorMessage(e)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBatch, batchIds]);

  const writeBatch = (byOne: boolean, at: number) => {
    if (!batchData) return;
    const msg = byOne ? batchSingle(batchData, at, f, tag) : batchMessage(batchData, f, tag);
    generated.current = msg;
    setText(msg);
  };
  const switchOneByOne = (v: boolean) => {
    setOneByOne(v);
    setStep(0);
    writeBatch(v, 0);
  };

  // A different @tag swaps only the top line, so the operator's other edits stay.
  const pickTag = (pick: number | 'none' | 'other', typed = otherTag) => {
    setTagPick(pick);
    setOtherTag(typed);
    const next: TagPerson | null = pick === 'other' ? (typed.trim() ? { name: typed.trim() } : null) : pick === 'none' ? null : contacts[pick] ?? null;
    const msg = withTag(text, next);
    if (text === generated.current) generated.current = msg;
    setText(msg);
  };

  // No link yet (it failed when the screen opened): ask again once the sheet is open.
  useEffect(() => {
    if (target && !trackingUrl) onNeedTracking?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

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
  // The company's WhatsApp Business number can send straight to a phone number (not to groups).
  const canSendDirect = !!update && whatsappApi && !!digits(phone);
  const direct = viaCompany && canSendDirect;
  const chosenItems = update ? update.items.filter((m) => chosen.has(m.id)) : [];
  const photoCount = chosenItems.filter((m) => m.kind !== 'video').length;
  const videoCount = chosenItems.length - photoCount;
  const attached = [photoCount ? `${photoCount} photo${photoCount > 1 ? 's' : ''}` : '', videoCount ? `${videoCount} video${videoCount > 1 ? 's' : ''}` : '']
    .filter(Boolean)
    .join(' + ');

  // Same wording as the server's message (services/operatorInbox.ts), minus its link — the photos go as files.
  const caption = update
    ? [
        `*${[trip.ref_id, updateTitle(update)].filter(Boolean).join(' · ')}${update.stop ? ` · ${update.stop.name}` : ''}*`,
        [trip.customer?.name, update.trip.route].filter(Boolean).join(' · '),
        [update.vehicle_plate ? `Truck ${update.vehicle_plate}` : '', update.driver?.name ? `Driver ${update.driver.name}` : ''].filter(Boolean).join(' · '),
        update.delay_note ? `Reason: ${update.delay_note}` : null,
        withNext && nextLine ? nextLine : null,
        trackingUrl ? `\nTrack live: ${trackingUrl}` : null,
      ].filter(Boolean).join('\n')
    : '';

  const send = async () => {
    if (needsNumber && !digits(otherPhone)) {
      Alert.alert('Enter the WhatsApp number');
      return;
    }
    if (!update) {
      if (isBatch && !batchData) return;
      Linking.openURL(waLink(phone, text)).catch(() => Alert.alert('Could not open WhatsApp'));
      // One by one: stay open on the next trip for when the operator comes back from WhatsApp.
      if (isBatch && oneByOne && batchData && step < batchData.items.length - 1) {
        setStep(step + 1);
        writeBatch(true, step + 1);
        return;
      }
      onClose();
      return;
    }
    if (chosen.size === 0) {
      Alert.alert('Pick at least one photo');
      return;
    }
    setSending(true);
    const record = (channel: 'link' | 'whatsapp_api') => operatorService.shareDriverUpdate({
      trip_id: trip.id,
      update_key: update.key,
      media_ids: chosenItems.map((m) => m.id),
      recipient: (who === 'driver' ? 'other' : who) as ShareRecipient,
      recipient_phone: digits(phone) || null,
      channel,
    });
    try {
      if (direct) {
        // The server sends the images itself, the caption on the first one.
        await record('whatsapp_api');
        onShared();
        onClose();
        Alert.alert('Sent', `${attached} sent to ${phone} from the company WhatsApp.`);
        return;
      }
      // The images themselves go through the share sheet; pick WhatsApp and the chat there.
      const r = await shareMediaFiles(chosenItems, caption);
      if (r.dismissed) return;
      // Marked as sent only once they actually went out.
      await record('link').catch(() => {});
      onShared();
      onClose();
      if (r.onlyFirst) {
        Alert.alert('Only the first photo was sent', 'This app version can send one photo at a time. Update the app to send them all together.');
      } else if (r.captionCopied && chosenItems.length > 1) {
        Alert.alert('Caption copied', 'If WhatsApp didn’t keep the text, paste it into the chat.');
      }
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
      {/* flexShrink lets the options scroll while the send button below stays on screen */}
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
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
            {canSendDirect ? (
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchText}>Send from company WhatsApp</Text>
                  <Text style={s.optDetail}>Straight to {phone}, no need to open WhatsApp</Text>
                </View>
                <Switch value={viaCompany} onValueChange={setViaCompany} trackColor={{ true: WA }} />
              </View>
            ) : null}
            <Text style={s.label}>Preview</Text>
            <View style={s.chat}>
              <View style={s.bubbleWrap}>
                <View style={s.bubbleMedia}>
                  {chosenItems.slice(0, 4).map((m, i) => {
                    const uri = resolveMediaUrl(m.url);
                    const more = i === 3 && chosenItems.length > 4 ? chosenItems.length - 3 : 0;
                    return (
                      <View key={m.id} style={[s.bubbleThumb, chosenItems.length === 1 && s.bubbleThumbOne]}>
                        {m.kind === 'video' || !uri ? (
                          <View style={[s.pickImg, { backgroundColor: INK, alignItems: 'center', justifyContent: 'center' }]}><Play size={16} color={Colors.white} fill={Colors.white} /></View>
                        ) : <Image source={{ uri }} style={s.pickImg} />}
                        {more ? <View style={s.bubbleMore}><Text style={s.bubbleMoreText}>+{more}</Text></View> : null}
                      </View>
                    );
                  })}
                </View>
                <Text style={s.bubbleCaption}>{caption}</Text>
              </View>
            </View>
            {!direct ? <Text style={[s.optDetail, { textAlign: 'center' }]}>{attached || 'Nothing'} sent as files. Pick WhatsApp and the chat in the share menu.</Text> : null}
          </>
        ) : (
          <>
            {isAssignment ? (
              <>
                <Text style={s.label}>Who asked for this truck?</Text>
                <View style={s.chips}>
                  {contacts.map((c, i) => (
                    <TouchableOpacity key={c.name} style={[s.chip, tagPick === i && s.chipOn]} onPress={() => { tap(); pickTag(i); }}>
                      <Text style={[s.chipText, tagPick === i && s.chipTextOn]} numberOfLines={1}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[s.chip, tagPick === 'other' && s.chipOn]} onPress={() => { tap(); pickTag('other'); }}>
                    <Text style={[s.chipText, tagPick === 'other' && s.chipTextOn]}>+ Someone else</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.chip, tagPick === 'none' && s.chipOn]} onPress={() => { tap(); pickTag('none'); }}>
                    <Text style={[s.chipText, tagPick === 'none' && s.chipTextOn]}>No tag</Text>
                  </TouchableOpacity>
                </View>
                {tagPick === 'other' ? (
                  <TextInput style={s.input} value={otherTag} onChangeText={(v) => pickTag('other', v)} placeholder="Name, as in the group" placeholderTextColor="#9898A4" autoFocus />
                ) : null}
              </>
            ) : null}
            {isBatch ? (
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchText}>Send one by one</Text>
                  <Text style={s.optDetail}>{oneByOne ? `${batchIds.length} separate messages, one per trip` : `All ${batchIds.length} trips in one message`}</Text>
                </View>
                <Switch value={oneByOne} onValueChange={switchOneByOne} trackColor={{ true: WA }} disabled={!batchData} />
              </View>
            ) : null}
            <Text style={s.label}>{isBatch && oneByOne ? `Message · trip ${step + 1} of ${batchIds.length}` : 'Message'}</Text>
            {isBatch && !batchData ? (
              batchError
                ? <Text style={s.optDetail}>Couldn’t load the trips: {batchError}</Text>
                : <View style={[s.input, s.message, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={WA} /></View>
            ) : (
              <TextInput style={[s.input, s.message]} value={text} onChangeText={setText} multiline textAlignVertical="top" />
            )}
            {isAssignment && tag ? (
              <Text style={s.optDetail}>If @{tag.name} shows as plain text in WhatsApp, type @ and pick the name before sending.</Text>
            ) : null}
          </>
        )}

      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={[s.sendBtn, sending && { opacity: 0.7 }]} activeOpacity={0.85} onPress={send} disabled={sending}>
          <MessageCircle size={19} color={Colors.white} strokeWidth={2.3} />
          <Text style={s.sendText}>{sending ? (update && !direct ? 'Getting photos ready…' : 'Sending…') : update ? (direct ? `Send ${attached}` : `Share ${attached || 'photos'}`) : isBatch && oneByOne ? `Open WhatsApp · ${step + 1} of ${batchIds.length}` : 'Open WhatsApp'}</Text>
        </TouchableOpacity>
        {update ? <Text style={[s.optDetail, { textAlign: 'center' }]}>Marked as sent for everyone, so nothing goes out twice</Text> : null}
      </View>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: '#E4E7EE', paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  chipOn: { borderColor: WA, backgroundColor: '#F2FBF5' },
  chipText: { fontSize: 13, fontWeight: '700', color: INK },
  chipTextOn: { color: '#0F6B37' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  switchText: { fontSize: 14, fontWeight: '600', color: INK },
  chat: { backgroundColor: '#E9E2D6', borderRadius: 16, padding: 12 },
  bubble: { backgroundColor: '#D9FDD3', borderRadius: 12, borderBottomRightRadius: 4, padding: 10, marginLeft: 30, fontSize: 13, lineHeight: 19, color: INK },
  bubbleCaption: { paddingHorizontal: 6, paddingVertical: 5, fontSize: 13, lineHeight: 19, color: INK },
  bubbleWrap: { marginLeft: 30, backgroundColor: '#D9FDD3', borderRadius: 12, borderBottomRightRadius: 4, padding: 4, gap: 2 },
  bubbleMedia: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  bubbleThumb: { width: '49%', aspectRatio: 1, borderRadius: 9, overflow: 'hidden', backgroundColor: '#C9E9C2' },
  bubbleThumbOne: { width: '100%', aspectRatio: 4 / 3 },
  bubbleMore: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  bubbleMoreText: { color: Colors.white, fontSize: 20, fontWeight: '800' },
  footer: { gap: 8, paddingTop: 10 },
  sendBtn: { height: 52, borderRadius: 14, backgroundColor: WA, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  sendText: { color: Colors.white, fontSize: 16, fontWeight: '800' },
});
