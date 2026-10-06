/**
 * "How to read the map" — opened from the ⓘ control on the Fleet map, beside
 * the control column. Mirrors what FleetMap draws (and the web live map's
 * legend): glyph colour = the trip, glyph shape = the movement, the badge =
 * which GPS is live, numbered bubble = a group, and the trip's lines and stops.
 * Ends with the map credit, which the OpenFreeMap / OpenMapTiles /
 * OpenStreetMap licences require to stay reachable.
 */
import React from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { X } from 'lucide-react-native';
import { ICONS, SILENT_COLOR, TONE, type UnitTone } from './FleetMap';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const BRAND = '#FA634E';

/** A small marker: white disc with the glyph inside. */
function Pin({ children }: { children: React.ReactNode }) {
  return <View style={s.pin}>{children}</View>;
}

function Badge({ truck, person }: { truck?: boolean; person?: boolean }) {
  return (
    <View style={s.badge}>
      {truck ? <Image source={ICONS.truck} style={s.badgeIcon} fadeDuration={0} /> : null}
      {person ? <Image source={ICONS.person} style={s.badgeIcon} fadeDuration={0} /> : null}
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

const TONES: UnitTone[] = ['active', 'delayed', 'upcoming', 'free'];
const open = (url: string) => () => { Linking.openURL(url).catch(() => {}); };

export function FleetLegend({ style, onClose }: { style?: ViewStyle; onClose: () => void }) {
  return (
    <View style={[s.card, style]}>
      <View style={s.head}>
        <Text style={s.title}>How to read the map</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel="Close"><X size={16} color={MUTED} /></TouchableOpacity>
      </View>

      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }} showsVerticalScrollIndicator={false}>
        <Text style={s.section}>Colour — trip</Text>
        {TONES.map((t) => (
          <Row key={t} icon={<View style={[s.dot, { backgroundColor: TONE[t].color }]} />}>
            {TONE[t].label}{t === 'free' ? ' — no trip right now' : ''}
          </Row>
        ))}

        <Text style={s.section}>Shape — movement</Text>
        <Row icon={<Pin><Image source={ICONS.nav} style={{ width: 12, height: 12, tintColor: TONE.active.color }} fadeDuration={0} /></Pin>}>
          Moving — arrow points where it&apos;s heading
        </Row>
        <Row icon={<Pin><View style={[s.square, { backgroundColor: TONE.active.color }]} /></Pin>}>Stopped</Row>
        <Row icon={<Pin><View style={s.ring} /></Pin>}>No GPS for 30 min — last known spot and its age</Row>

        <Text style={s.section}>Badge — live GPS</Text>
        <Row icon={<Badge truck />}>Truck tracker</Row>
        <Row icon={<Badge person />}>Driver&apos;s phone (on trips only)</Row>
        <Row icon={<Badge truck person />}>Both — truck and driver together</Row>

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

        <Text style={s.credit}>
          Map ©{' '}
          <Text style={s.link} onPress={open('https://openfreemap.org')}>OpenFreeMap</Text>
          {' · '}
          <Text style={s.link} onPress={open('https://www.openmaptiles.org/')}>OpenMapTiles</Text>
          {' · Data ©\u00A0'}
          <Text style={s.link} onPress={open('https://www.openstreetmap.org/copyright')}>OpenStreetMap contributors</Text>
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    position: 'absolute', right: 64, width: 260, maxHeight: '75%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  title: { fontSize: 14, fontWeight: '700', color: INK },
  section: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconCell: { width: 34, alignItems: 'center' },
  rowText: { flex: 1, fontSize: 12, color: '#3F3F46' },
  pin: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  square: { width: 8, height: 8, borderRadius: 3 },
  ring: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: SILENT_COLOR },
  badge: { flexDirection: 'row', gap: 1, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 8, backgroundColor: INK },
  badgeIcon: { width: 10, height: 10 },
  credit: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4E4E7', fontSize: 11, color: MUTED, lineHeight: 16 },
  link: { textDecorationLine: 'underline' },
  group: { width: 24, height: 24, borderRadius: 12, backgroundColor: INK, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  groupText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  line: { width: 26, height: 4, borderRadius: 2, backgroundColor: BRAND },
  dashed: { backgroundColor: 'transparent', height: 0, borderTopWidth: 3, borderStyle: 'dashed', borderColor: BRAND, borderRadius: 0 },
  stopsRow: { flexDirection: 'row', gap: 2 },
  stop: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#71717A' },
  stopDone: { backgroundColor: INK, borderColor: INK },
  stopNext: { backgroundColor: BRAND, borderColor: BRAND },
});
