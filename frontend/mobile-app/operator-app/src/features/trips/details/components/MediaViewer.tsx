/** Full-screen photo / video viewer: swipe through a step's uploads, send them, or open a video. */
import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, Image, Linking, useWindowDimensions, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExternalLink, MessageCircle, Play, X } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { WA } from './parts';

export interface ViewerItem {
  id: string;
  url: string;
  kind: 'photo' | 'video';
  caption: string;
}

interface Props {
  items: ViewerItem[] | null;
  startIndex: number;
  title: string;
  onClose: () => void;
  /** Shown when the items came from one driver update. */
  onSend?: () => void;
}

export function MediaViewer({ items, startIndex, title, onClose, onSend }: Props) {
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
                    <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                  ) : null}
                </View>
              );
            }}
          />
        ) : null}

        {onSend ? (
          <TouchableOpacity style={s.send} activeOpacity={0.85} onPress={onSend}>
            <MessageCircle size={18} color={Colors.white} strokeWidth={2.3} />
            <Text style={s.sendText}>Send on WhatsApp</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E0E12' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  title: { color: Colors.white, fontSize: 15, fontWeight: '800' },
  sub: { color: '#C9C9D2', fontSize: 12, marginTop: 1 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  video: { height: 260, borderRadius: 20, backgroundColor: '#2B2A2B', alignItems: 'center', justifyContent: 'center', gap: 14 },
  play: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E0503B', alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  openText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  send: { marginHorizontal: 16, height: 52, borderRadius: 14, backgroundColor: WA, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendText: { color: Colors.white, fontSize: 15, fontWeight: '800' },
});
