/**
 * A small drawing of the route from its stops' map pins: numbered dots joined
 * in order (pickup in ink, drop-off in brand), scaled to fit the card. Not a
 * map — no tiles, no network — just the shape and direction of the lane, so
 * "Dammam → Jubail → Hafar Al Batin" reads as north-then-west at a glance.
 * Renders nothing when fewer than two distinct stops have a pin.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline, Text as SvgText } from 'react-native-svg';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { niceName } from '@/features/trips/create/components/ui';
import type { QuotationStopItem } from '../types';

const INK = '#3E3C3D';
const HEIGHT = 150;
const PAD = 22;

interface Point { x: number; y: number; n: number; name: string; first: boolean; last: boolean }

/** The stops that have a pin, in order, with consecutive repeats (a round trip's turn) dropped. */
export function pinnedStops(stops: QuotationStopItem[]) {
  const out: (QuotationStopItem & { n: number })[] = [];
  stops.forEach((s, i) => {
    if (s.lat == null || s.lng == null) return;
    const prev = out[out.length - 1];
    if (prev && prev.lat === s.lat && prev.lng === s.lng) return;
    out.push({ ...s, n: i + 1 });
  });
  const distinct = new Set(out.map((s) => `${s.lat},${s.lng}`)).size;
  return distinct >= 2 ? out : [];
}

export function RouteSketch({ stops }: { stops: QuotationStopItem[] }) {
  const [width, setWidth] = useState(0);
  const pins = pinnedStops(stops);
  if (pins.length < 2) return null;

  // Longitude shrinks with latitude; scale it so the shape isn't stretched.
  const midLat = pins.reduce((a, p) => a + p.lat!, 0) / pins.length;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = pins.map((p) => p.lng! * kx);
  const ys = pins.map((p) => -p.lat!);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const w = Math.max(width - PAD * 2, 1);
  const h = HEIGHT - PAD * 2;
  const scale = Math.min(w / spanX, h / spanY);
  const offX = PAD + (w - spanX * scale) / 2;
  const offY = PAD + (h - spanY * scale) / 2;
  const points: Point[] = pins.map((p, i) => ({
    x: offX + (xs[i] - minX) * scale,
    y: offY + (ys[i] - minY) * scale,
    n: p.n,
    name: niceName(p.shortName),
    first: i === 0,
    last: i === pins.length - 1,
  }));

  return (
    <View style={s.box} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          <Polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#F7B8AE" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 5" />
          {points.map((p) => {
            const fill = p.last ? Colors.primary : p.first ? INK : '#FFFFFF';
            const fg = p.first || p.last ? '#FFFFFF' : INK;
            return (
              <React.Fragment key={`${p.n}-${p.x}`}>
                <Circle cx={p.x} cy={p.y} r={10} fill={fill} stroke={p.first || p.last ? fill : '#C9C9CF'} strokeWidth={2} />
                <SvgText x={p.x} y={p.y + 4} fontSize={11} fontWeight="700" fill={fg} textAnchor="middle">{String(p.n)}</SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
      <Text style={s.caption}>Shape of the route from the stops’ map pins — not to road scale</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderRadius: 14, backgroundColor: '#F6F7F9', borderWidth: 1, borderColor: '#EEEEF1', overflow: 'hidden', marginTop: 8 },
  caption: { fontSize: 11, color: '#9898A4', paddingHorizontal: 10, paddingBottom: 8 },
});
