/**
 * Hour / minute / second scroll wheels (iOS-style), pure JS so it ships without
 * a native build. Value in and out is "HH:MM:SS"; each wheel snaps to one row,
 * and tapping a row jumps to it.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { INK, MUTED } from './parts';

const ROW = 36;
const VISIBLE = 5; // odd, so one row sits in the middle
const PAD = ROW * ((VISIBLE - 1) / 2);

const p2 = (n: number) => String(n).padStart(2, '0');

function Wheel({ count, value, onChange, label }: { count: number; value: number; onChange: (v: number) => void; label: string }) {
  const ref = useRef<ScrollView>(null);
  const last = useRef(value);

  // Follow a value set from outside (e.g. "Undo" back to the tapped time).
  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    ref.current?.scrollTo({ y: value * ROW, animated: true });
  }, [value]);

  const settle = (y: number) => {
    const i = Math.max(0, Math.min(count - 1, Math.round(y / ROW)));
    if (i === last.current) return;
    last.current = i;
    Haptics.selectionAsync().catch(() => {});
    onChange(i);
  };
  const onDragEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // A flick carries on into momentum, which settles it; a slow release stops here.
    const v = e.nativeEvent.velocity?.y ?? 0;
    if (Math.abs(v) < 0.05) settle(e.nativeEvent.contentOffset.y);
  };

  return (
    <View style={s.wheel}>
      <ScrollView
        ref={ref}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: value * ROW }}
        onLayout={() => ref.current?.scrollTo({ y: value * ROW, animated: false })}
        onScrollEndDrag={onDragEnd}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingVertical: PAD }}
        accessibilityLabel={label}
      >
        {Array.from({ length: count }, (_, i) => {
          const d = Math.abs(i - value);
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.6}
              style={s.item}
              onPress={() => { ref.current?.scrollTo({ y: i * ROW, animated: true }); settle(i * ROW); }}
            >
              <Text style={[s.itemText, d === 0 ? s.itemOn : d === 1 ? s.itemNear : s.itemFar]}>{p2(i)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function TimeWheel({ value, onChange }: { value: string; onChange: (clock: string) => void }) {
  const [h = 0, m = 0, sec = 0] = value.split(':').map((x) => Number(x) || 0);
  const emit = (nh: number, nm: number, ns: number) => onChange(`${p2(nh)}:${p2(nm)}:${p2(ns)}`);
  return (
    <View style={s.wrap}>
      <View style={s.band} pointerEvents="none" />
      <Wheel label="Hour" count={24} value={h} onChange={(v) => emit(v, m, sec)} />
      <Text style={s.colon}>:</Text>
      <Wheel label="Minute" count={60} value={m} onChange={(v) => emit(h, v, sec)} />
      <Text style={s.colon}>:</Text>
      <Wheel label="Second" count={60} value={sec} onChange={(v) => emit(h, m, v)} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: ROW * VISIBLE },
  band: { position: 'absolute', left: 0, right: 0, top: PAD, height: ROW, borderRadius: 10, backgroundColor: '#F1F1F3' },
  wheel: { width: 64, height: ROW * VISIBLE },
  item: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 20, fontVariant: ['tabular-nums'] },
  itemOn: { color: INK, fontWeight: '700', fontSize: 22 },
  itemNear: { color: MUTED },
  itemFar: { color: '#C4C4CC' },
  colon: { fontSize: 22, fontWeight: '700', color: INK, marginHorizontal: 2 },
});
