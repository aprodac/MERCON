/**
 * Full-screen photo / video viewer: swipe through a step's uploads, send them, or open a video.
 * Each photo says whether the customer has it yet, and the footer says who sent the set and when.
 */
import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, Linking, useWindowDimensions, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRightLeft, CheckCheck, Clock3, Crosshair, ExternalLink, Info, MessageCircle, Play, Route, Trash2, X } from 'lucide-react-native';
import { GoogleMapsGeotagPreview } from '@mercon/mobile-shared/components/GoogleMapsGeotagPreview';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import type { SendState } from '../tripDetailsModel';
import { WA } from './parts';
import { ZoomableImage } from '../../../../components/ZoomableImage';

export interface ViewerItem {
  id: string;
  url: string;
  kind: 'photo' | 'video';
  caption: string;
  /** Set for driver photos: has this one reached the customer? */
  sent?: boolean;
  /** The photo's geotag — shown with the same panel the driver app stamps on its photos. */
  geo?: { lat: number; lng: number; captured_at: string; place?: string | null; address?: string | null; customer?: string | null } | null;
  /** One line of facts, e.g. "Taken 08:23 · uploaded 08:25 · 40 m from the Jeddah pin". */
  info?: string | null;
  /** E.g. "Use as Jeddah's pin" when the stop's pin is a guess and this photo has GPS. */
  pinAction?: { label: string; onPress: () => void } | null;
  /** "Edit Najran's time": opens Check times on this photo's stop (TestFlight: edit a POD's time from the photo). */
  timeAction?: { label: string; onPress: () => void } | null;
  /** Remove a photo the driver sent by mistake (the caller asks "are you sure?" first). */
  deleteAction?: { onPress: () => void } | null;
  /** Sent at the wrong stop: move it to another one. */
  moveAction?: { onPress: () => void } | null;
}

interface Props {
  items: ViewerItem[] | null;
  startIndex: number;
  title: string;
  /** Which trip the photos belong to, e.g. "Riyadh → Jeddah · Nouman · KSA-6102". */
  context?: string | null;
  onClose: () => void;
  /** Shown when the items came from one driver update. */
  onSend?: () => void;
  /** Whether that update reached the customer, e.g. "Sent to customer group by Ilan · 9 h ago". */
  status?: { state: SendState; text: string };
  /** A second button beside Send, e.g. from Notifications. */
  onOpenTrip?: () => void;
}

export function MediaViewer({ items, startIndex, title, context, onClose, onSend, status, onOpenTrip }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex);
  const list = useRef<FlatList<ViewerItem>>(null);

  const [shownFor, setShownFor] = useState(items);
  if (items !== shownFor) {
    setShownFor(items);
    setIndex(startIndex);
  }

  const current = items?.[index];

  return (
    <Modal visible={!!items} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={[s.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={s.top}>
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>{title}</Text>
            {context ? <Text style={s.sub} numberOfLines={1}>{context}</Text> : null}
            <Text style={s.sub} numberOfLines={1}>{current?.caption}{items && items.length > 1 ? ` · ${index + 1} of ${items.length}` : ''}</Text>
          </View>
          <TouchableOpacity style={s.close} onPress={onClose} accessibilityLabel="Close">
            <X size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {items ? (
          <FlatList
            key={`${items[0]?.id}-${startIndex}`}
            ref={list}
            data={items}
            horizontal
            pagingEnabled
            initialScrollIndex={Math.min(startIndex, items.length - 1)}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(m) => m.id}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => {
              const uri = resolveMediaUrl(item.url);
              return (
                <View style={{ width, flex: 1, justifyContent: 'center', padding: 12 }}>
                  {item.kind === 'video' ? (
                    <TouchableOpacity style={s.video} activeOpacity={0.85} onPress={() => uri && Linking.openURL(uri).catch(() => {})}>
                      <View style={s.play}><Play size={30} color={Colors.white} fill={Colors.white} /></View>
                      <View style={s.openRow}>
                        <ExternalLink size={14} color={Colors.white} />
                        <Text style={s.openText}>Open video</Text>
                      </View>
                    </TouchableOpacity>
                  ) : uri ? (
                    <View style={{ flex: 1 }}>
                      <ZoomableImage uri={uri} style={{ width: '100%', flex: 1 }} />
                      {item.geo ? (
                        <View style={s.geo}>
                          <GoogleMapsGeotagPreview
                            latitude={item.geo.lat}
                            longitude={item.geo.lng}
                            timestamp={item.geo.captured_at}
                            locationName={item.geo.place ?? null}
                            fullAddress={item.geo.address ?? null}
                            companyName={item.geo.customer ?? null}
                            bottomPadding={10}
                          />
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {item.sent != null ? (
                    <View style={[s.mark, { backgroundColor: item.sent ? WA : '#B45309' }]}>
                      {item.sent ? <CheckCheck size={13} color={Colors.white} strokeWidth={2.6} /> : <Clock3 size={13} color={Colors.white} strokeWidth={2.6} />}
                      <Text style={s.markText}>{item.sent ? 'Sent' : 'Not sent'}</Text>
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        ) : null}

        {current?.info || current?.pinAction || current?.timeAction || current?.deleteAction || current?.moveAction ? (
          <View style={s.facts}>
            {current.info ? (
              <View style={s.factRow}>
                <Info size={14} color="#C9C9D2" />
                <Text style={s.factText} numberOfLines={2}>{current.info}</Text>
              </View>
            ) : null}
            {/* Side by side, not stacked: the photo stays the biggest thing on screen. */}
            {current.timeAction || current.pinAction || current.deleteAction || current.moveAction ? (
              <View style={s.factBtns}>
                {current.timeAction ? (
                  <TouchableOpacity style={[s.pinBtn, s.timeBtn]} activeOpacity={0.85} onPress={current.timeAction.onPress} accessibilityRole="button">
                    <Clock3 size={15} color="#7C2D12" />
                    <Text style={[s.pinBtnText, { color: '#7C2D12' }]} numberOfLines={2}>{current.timeAction.label}</Text>
                  </TouchableOpacity>
                ) : null}
                {current.pinAction ? (
                  <TouchableOpacity style={s.pinBtn} activeOpacity={0.85} onPress={current.pinAction.onPress} accessibilityRole="button">
                    <Crosshair size={15} color="#1E3A8A" />
                    <Text style={s.pinBtnText} numberOfLines={2}>{current.pinAction.label}</Text>
                  </TouchableOpacity>
                ) : null}
                {current.moveAction ? (
                  <TouchableOpacity style={[s.delBtn, s.moveBtn]} activeOpacity={0.85} onPress={current.moveAction.onPress} accessibilityRole="button" accessibilityLabel="Move this photo to another stop">
                    <ArrowRightLeft size={15} color="#1E3A8A" />
                    <Text style={[s.pinBtnText, { color: '#1E3A8A' }]} numberOfLines={1}>Move</Text>
                  </TouchableOpacity>
                ) : null}
                {current.deleteAction ? (
                  <TouchableOpacity style={s.delBtn} activeOpacity={0.85} onPress={current.deleteAction.onPress} accessibilityRole="button" accessibilityLabel="Delete this photo">
                    <Trash2 size={15} color="#B42318" />
                    <Text style={[s.pinBtnText, { color: '#B42318' }]} numberOfLines={1}>Delete</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {status ? (
          <View style={s.status}>
            {status.state !== 'unsent'
              ? <CheckCheck size={15} color="#4ADE80" strokeWidth={2.6} />
              : <Clock3 size={15} color="#FBBF24" strokeWidth={2.4} />}
            <Text style={[s.statusText, { color: status.state !== 'unsent' ? '#BBF7D0' : '#FDE68A' }]} numberOfLines={2}>{status.text}</Text>
          </View>
        ) : null}

        {onSend || onOpenTrip ? (
          <View style={s.buttons}>
            {onOpenTrip ? (
              <TouchableOpacity style={[s.btn, s.ghost, !onSend && { flex: 1 }]} activeOpacity={0.85} onPress={onOpenTrip}>
                <Route size={17} color={Colors.white} strokeWidth={2.3} />
                <Text style={s.sendText}>Open trip</Text>
              </TouchableOpacity>
            ) : null}
            {onSend ? (
              <TouchableOpacity
                style={[s.btn, { flex: 1 }, status && status.state !== 'unsent' ? s.ghost : { backgroundColor: WA }]}
                activeOpacity={0.85}
                onPress={onSend}
              >
                <MessageCircle size={18} color={Colors.white} strokeWidth={2.3} />
                <Text style={s.sendText}>{status?.state === 'sent' ? 'Send again' : status?.state === 'partial' ? 'Send more' : 'Send on WhatsApp'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  geo: { borderRadius: 14, overflow: 'hidden', marginTop: 10 },
  facts: { marginHorizontal: 16, marginBottom: 10, gap: 8 },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factText: { flex: 1, color: '#E4E4E9', fontSize: 13 },
  factBtns: { flexDirection: 'row', gap: 8 },
  pinBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#DBEAFE' },
  // Narrow, beside the wider actions: deleting is the rare one.
  delBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#FEE4E2' },
  moveBtn: { backgroundColor: '#DBEAFE' },
  pinBtnText: { flexShrink: 1, color: '#1E3A8A', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  timeBtn: { backgroundColor: '#FFEDD5' },
  root: { flex: 1, backgroundColor: '#3E3C3D' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  title: { color: Colors.white, fontSize: 15, fontWeight: '800' },
  sub: { color: '#C9C9D2', fontSize: 12, marginTop: 1 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  video: { height: 260, borderRadius: 20, backgroundColor: '#3E3C3D', alignItems: 'center', justifyContent: 'center', gap: 14 },
  play: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E0503B', alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  openText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  mark: { position: 'absolute', top: 22, left: 22, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  markText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  statusText: { flex: 1, fontSize: 13, fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: 10, marginHorizontal: 16 },
  btn: { height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  ghost: { backgroundColor: 'rgba(255,255,255,0.16)' },
  sendText: { color: Colors.white, fontSize: 15, fontWeight: '800' },
});
