/**
 * A route drawn small, without a map: the stops' real positions scaled into a
 * tile, start green, end red, the stops between as dots — so each card shows
 * which way the route runs at a glance (the big map above shows the one picked).
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { MapPinOff } from 'lucide-react-native';

const START = '#12B76A';
const END = '#E0503B';

export function RouteSketch({ points, size = 64, selected = false }: { points: [number, number][]; size?: number; selected?: boolean }) {
  if (points.length < 2) {
    return (
      <View style={[s.empty, { width: size, height: size }]}>
        <MapPinOff size={18} color="#A0A0AA" />
      </View>
    );
  }
  // Longitude shrinks with latitude: scale x by cos(lat) so the shape isn't stretched.
  const midLat = points.reduce((a, p) => a + p[1], 0) / points.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = points.map((p) => p[0] * k);
  const ys = points.map((p) => -p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const pad = 12;
  const inner = size - pad * 2;
  const at = (i: number) => {
    const x = pad + ((xs[i] - minX) / span) * inner + (inner - ((maxX - minX) / span) * inner) / 2;
    const y = pad + ((ys[i] - minY) / span) * inner + (inner - ((maxY - minY) / span) * inner) / 2;
    return [x, y] as const;
  };
  const pts = points.map((_, i) => at(i));
  // A gentle curve between the stops reads as a route rather than a ruler line.
  const d = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const mx = (px + x) / 2 - (y - py) * 0.18;
    const my = (py + y) / 2 + (x - px) * 0.18;
    return `${acc} Q ${mx} ${my} ${x} ${y}`;
  }, '');
  const [sx, sy] = pts[0];
  const [ex, ey] = pts[pts.length - 1];
  return (
    <Svg width={size} height={size}>
      <Rect x={0} y={0} width={size} height={size} rx={14} fill={selected ? '#EEF1FB' : '#F3F4F7'} />
      <Path d={d} stroke="#FFFFFF" strokeWidth={6} fill="none" strokeLinecap="round" />
      <Path d={d} stroke={selected ? '#1F4FD1' : '#7A7F8C'} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      {pts.slice(1, -1).map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={3} fill="#FFFFFF" stroke="#7A7F8C" strokeWidth={1.5} />)}
      <Circle cx={sx} cy={sy} r={5} fill={START} stroke="#FFFFFF" strokeWidth={2} />
      <Circle cx={ex} cy={ey} r={5} fill={END} stroke="#FFFFFF" strokeWidth={2} />
    </Svg>
  );
}

const s = StyleSheet.create({
  empty: { borderRadius: 14, backgroundColor: '#F3F4F7', alignItems: 'center', justifyContent: 'center' },
});
