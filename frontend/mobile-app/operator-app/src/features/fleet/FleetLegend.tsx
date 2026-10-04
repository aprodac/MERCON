/**
 * "How to read the map" — opened from the ⓘ control on the Fleet map, beside
 * the control column. Mirrors what FleetMap draws: pin colour = trip state,
 * arrow = moving and its heading, grey dot = GPS gone quiet, numbered bubble =
 * a group, and the trip's lines and stops.
 */
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { X } from 'lucide-react-native';
import { STATE_STYLE } from './FleetMap';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const BRAND = '#FA634E';

const truckWhite = require('./icons/truck-white.png');
const truckInk = require('./icons/truck-ink.png');
const navWhite = require('./icons/nav-white.png');

function Pin({ color, free, icon, silent }: { color: string; free?: boolean; icon: number; silent?: boolean }) {
  return (
    <View style={[s.pin, { backgroundColor: color }, free && s.pinFree]}>
      <Image source={icon} style={{ width: 12, height: 12 }} fadeDuration={0} />
      {silent ? <View style={s.silent} /> : null}
    </View>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={s.row}>
      <View style={s.iconCell}>{icon}</View>
      <Text style={s.rowText}>{children}</Text>
    </View>
  );
}

export function FleetLegend({ style, onClose }: { style?: ViewStyle; onClose: () => void }) {
  return (
    <View style={[s.card, style]}>
      <View style={s.head}>
        <Text style={s.title}>How to read the map</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel="Close"><X size={16} color={MUTED} /></TouchableOpacity>
      </View>

      <Text style={s.section}>Truck</Text>
      <Row icon={<Pin color={STATE_STYLE.moving.color} icon={truckWhite} />}>On a trip</Row>
      <Row icon={<Pin color={STATE_STYLE.delayed.color} icon={truckWhite} />}>Trip is delayed</Row>
      <Row icon={<Pin color="#FFFFFF" free icon={truckInk} />}>Free — no trip right now</Row>
      <Row icon={<Pin color={STATE_STYLE.moving.color} icon={navWhite} />}>Moving — arrow points where it&apos;s heading</Row>
      <Row icon={<Pin color={STATE_STYLE.moving.color} icon={truckWhite} silent />}>No GPS for 30 min — last known spot</Row>

      <Text style={s.section}>Map</Text>
      <Row icon={<View style={s.group}><Text style={s.groupText}>5</Text></View>}>Trucks close together — tap to zoom in</Row>
      <Row icon={<View style={[s.group, { borderColor: BRAND }]}><Text style={s.groupText}>5</Text></View>}>Red ring — some of them are delayed</Row>
      <Row icon={<View style={s.line} />}>Road route to the next stop</Row>
      <Row icon={<View style={[s.line, { opacity: 0.35 }]} />}>Rest of the trip</Row>
      <Row icon={<View style={[s.line, { backgroundColor: INK, opacity: 0.55, height: 3 }]} />}>Where it has driven on this trip</Row>
      <Row icon={<View style={[s.line, s.dashed]} />}>Straight line — road routing unavailable</Row>
      <Row icon={<View style={s.stopsRow}><View style={[s.stop, s.stopDone]} /><View style={[s.stop, s.stopNext]} /><View style={s.stop} /></View>}>
        Stops: done · next · still to come
      </Row>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    position: 'absolute', right: 64, width: 260, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  title: { fontSize: 14, fontWeight: '700', color: INK },
  section: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconCell: { width: 34, alignItems: 'center' },
  rowText: { flex: 1, fontSize: 12, color: '#3F3F46' },
  pin: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  pinFree: { borderColor: INK, borderWidth: 1.5 },
  silent: { position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#9898A4', borderWidth: 1.5, borderColor: '#FFFFFF' },
  group: { width: 24, height: 24, borderRadius: 12, backgroundColor: INK, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  groupText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  line: { width: 26, height: 4, borderRadius: 2, backgroundColor: BRAND },
  dashed: { backgroundColor: 'transparent', height: 0, borderTopWidth: 3, borderStyle: 'dashed', borderColor: BRAND, borderRadius: 0 },
  stopsRow: { flexDirection: 'row', gap: 2 },
  stop: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#71717A' },
  stopDone: { backgroundColor: INK, borderColor: INK },
  stopNext: { backgroundColor: BRAND, borderColor: BRAND },
});
