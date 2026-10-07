/**
 * "From drivers": the photo / video sets drivers sent that nobody has passed
 * on to the customer yet, newest first, as a sideways strip. Send opens the
 * trip with its share sheet on that set. Hidden when nothing is waiting.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet } from 'react-native';
import { ImageOff, Play } from 'lucide-react-native';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { needsSending, type DriverUpdate } from '../../../lib/operator';
import { STAGE_TITLE, durationText } from '../actions/actionModel';
import { INK, MUTED, tap } from '../../notifications/components/parts';

const SHOWN = 8;

export function FromDrivers({ updates, now, onSend }: {
  updates: DriverUpdate[];
  now: number;
  onSend: (u: DriverUpdate) => void;
}) {
  const waiting = updates
    .filter(needsSending)
    .sort((a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime());
  if (waiting.length === 0) return null;

  const ago = (iso: string) => {
    const min = (now - new Date(iso).getTime()) / 60000;
    return min < 1 ? 'just now' : `${durationText(min)} ago`;
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={s.head}>
        <Text style={s.h2}>From drivers</Text>
        <Text style={s.count}>{waiting.length} to send</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip} style={s.scroller}>
        {waiting.slice(0, SHOWN).map((u) => {
          const unsent = u.items.filter((m) => !u.sent_ids.includes(m.id));
          // Anything that isn't a video is a picture (POD, waybill and stop photos arrive with their own kinds).
          const isVideo = (m: { kind: string; mime: string | null }) => m.kind === 'video' || !!m.mime?.startsWith('video/');
          const cover = unsent[0] ?? u.items[0];
          const coverVideo = cover ? isVideo(cover) : false;
          const uri = cover && !coverVideo ? resolveMediaUrl(cover.url) : null;
          const videos = unsent.filter(isVideo).length;
          const label = videos === unsent.length
            ? `${unsent.length} video${unsent.length === 1 ? '' : 's'}`
            : videos === 0
              ? `${unsent.length} photo${unsent.length === 1 ? '' : 's'}`
              : `${unsent.length} items`;
          return (
            <View key={`${u.trip.id}:${u.key}`} style={s.item}>
              <TouchableOpacity style={s.thumb} onPress={() => { tap(); onSend(u); }} activeOpacity={0.85}
                accessibilityRole="button" accessibilityLabel={`${STAGE_TITLE[u.stage] ?? 'Photos'}, ${u.trip.ref_id ?? ''}, ${label}`}>
                {uri ? (
                  <Image source={{ uri }} style={StyleSheet.absoluteFill} />
                ) : (
                  <View style={[StyleSheet.absoluteFill, s.placeholder, coverVideo && { backgroundColor: INK }]}>
                    {coverVideo ? <Play size={22} color="#FFFFFF" fill="#FFFFFF" /> : <ImageOff size={22} color="#A1A1AA" />}
                  </View>
                )}
                <View style={s.badge}><Text style={s.badgeText}>{label}</Text></View>
                <View style={s.send}><Text style={s.sendText}>Send</Text></View>
              </TouchableOpacity>
              <Text style={s.title} numberOfLines={1}>{STAGE_TITLE[u.stage] ?? 'Photos'}</Text>
              <Text style={s.meta} numberOfLines={1}>{[u.trip.ref_id, ago(u.latest_at)].filter(Boolean).join(' · ')}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  h2: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  count: { fontSize: 14, fontWeight: '500', color: MUTED },
  // Bleed to the screen edges so the strip scrolls under the page padding.
  scroller: { marginHorizontal: -16 },
  strip: { gap: 10, paddingHorizontal: 16 },
  item: { width: 148, gap: 2 },
  thumb: { width: 148, height: 148, borderRadius: 18, overflow: 'hidden', backgroundColor: '#E4E7EE', marginBottom: 6 },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E4E7EE' },
  badge: { position: 'absolute', top: 8, left: 8, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: 'rgba(62,60,61,0.85)' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  send: { position: 'absolute', right: 8, bottom: 8, height: 30, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FA634E' },
  sendText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  title: { fontSize: 13, fontWeight: '700', color: INK },
  meta: { fontSize: 12, color: MUTED },
});
