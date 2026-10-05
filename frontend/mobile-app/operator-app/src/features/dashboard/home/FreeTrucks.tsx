/**
 * "Free trucks": the trucks that can take a job now, as a sideways strip of
 * cards: the truck's photo shown whole (they're designed ID cards with the
 * plate, capacity and body on them — nothing is drawn over it; a truck with
 * no photo gets a plain ID card instead), free / booked, GPS, driver with a call button,
 * a close document expiry, a trip it's already booked for). Chips narrow it
 * to one class and show free / total. A card opens the truck; Book opens
 * Create trip with that truck (and its driver) already chosen.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, Linking } from 'react-native';
import { ChevronRight, Phone, Plus, Truck, UserX } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import type { ExpiryItem, LiveUnit, OperatorVehicleOption } from '../../../lib/operator';
import { initialsOf, niceName, shortName } from '../../trips/create/components/ui';
import { INK, LINE, MUTED, tap } from '../../notifications/components/parts';
import { dayKeyIn } from './today';
import { freeTrucks, type FreeTruck } from './freeTrucksModel';

const GREEN = '#15803D';
const RED = '#D92D20';
const AMBER = '#B54708';
const CARD_W = 196;

export function FreeTrucks({ units, details, expiries, tz, now, onOpenTruck, onBook, onAll }: {
  units: LiveUnit[];
  details: OperatorVehicleOption[];
  expiries: ExpiryItem[];
  tz: string;
  now: number;
  onOpenTruck: (vehicleId: string) => void;
  onBook: (vehicleId: string) => void;
  onAll: () => void;
}) {
  const { free, classes, total } = useMemo(() => freeTrucks(units, details, expiries), [units, details, expiries]);
  const [cls, setCls] = useState<string | null>(null);
  const active = cls && classes.some((c) => c.truckClass === cls) ? cls : null;
  const shown = active ? free.filter((t) => t.truckClass === active) : free;

  const bookedLabel = (iso: string) => {
    try {
      const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
      if (dayKeyIn(tz, new Date(iso).getTime()) === dayKeyIn(tz, now)) return `Booked ${time}`;
      const day = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(new Date(iso));
      return `Booked ${day} ${time}`;
    } catch {
      return 'Booked';
    }
  };

  if (total === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      <View style={s.head}>
        <Text style={s.h2}>Free trucks</Text>
        <TouchableOpacity onPress={() => { tap(); onAll(); }} hitSlop={8} style={s.link}>
          <Text style={s.linkText}>All trucks</Text>
          <ChevronRight size={15} color={MUTED} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.chips}>
        <Chip label="All" count={`${free.length}`} on={!active} onPress={() => setCls(null)} />
        {classes.map((c) => (
          <Chip key={c.truckClass} label={c.truckClass} count={`${c.free}`} of={c.total} none={c.free === 0} on={active === c.truckClass} onPress={() => setCls(c.truckClass)} />
        ))}
      </ScrollView>

      {shown.length === 0 ? (
        <View style={s.empty}>
          <Truck size={20} color="#A1A1AA" strokeWidth={2} />
          <Text style={s.emptyText}>{active ? `No ${active} free right now` : 'No trucks free right now'}</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.strip}
          decelerationRate="fast" snapToInterval={CARD_W + 10}>
          {shown.map((t) => (
            <TruckCard key={t.vehicle.id} t={t} booked={t.nextTripAt ? bookedLabel(t.nextTripAt) : null}
              onOpen={() => onOpenTruck(t.vehicle.id)} onBook={() => onBook(t.vehicle.id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Chip({ label, count, of, none, on, onPress }: { label: string; count: string; of?: number; none?: boolean; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, on && s.chipOn]} onPress={() => { tap(); onPress(); }} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[s.chipText, on && { color: Colors.white }]}>{label}</Text>
      <Text style={[s.chipCount, { color: on ? Colors.white : none ? RED : GREEN }]}>{count}</Text>
      {of != null ? <Text style={[s.chipOf, on && { color: 'rgba(255,255,255,0.6)' }]}>/{of}</Text> : null}
    </TouchableOpacity>
  );
}

function TruckCard({ t, booked, onOpen, onBook }: { t: FreeTruck; booked: string | null; onOpen: () => void; onBook: () => void }) {
  const [broken, setBroken] = useState(false);
  const photo = broken ? null : resolveMediaUrl(t.vehicle.image_url);
  const driver = t.unit.driver;
  const driverPhoto = driver?.avatar_url ? resolveMediaUrl(driver.avatar_url) : null;
  const body = t.vehicle.asset_type ? niceName(t.vehicle.asset_type) : null;
  const doc = t.doc
    ? t.doc.days < 0
      ? { text: `${t.doc.label} expired`, color: RED, bg: '#FEF3F2' }
      : { text: `${t.doc.label} ${t.doc.days === 0 ? 'expires today' : `in ${t.doc.days} day${t.doc.days === 1 ? '' : 's'}`}`, color: AMBER, bg: '#FFFAEB' }
    : null;

  return (
    <TouchableOpacity style={s.card} onPress={() => { tap(); onOpen(); }} activeOpacity={0.85}
      accessibilityRole="button" accessibilityLabel={`${t.vehicle.plate_number}, ${t.truckClass}, ${driver ? niceName(driver.name) : 'no driver'}`}>
      {photo ? (
        // Whole image, never cropped or covered — the photo is the truck's ID card.
        <Image source={{ uri: photo }} style={s.photo} resizeMode="contain" onError={() => setBroken(true)} />
      ) : (
        <View style={[s.photo, s.idCard]}>
          <Truck size={34} color="rgba(255,255,255,0.55)" strokeWidth={1.6} />
          <Text style={s.idPlate} numberOfLines={1} adjustsFontSizeToFit>{t.vehicle.plate_number}</Text>
          <Text style={s.idLine} numberOfLines={1}>{[t.truckClass, body].filter(Boolean).join(' · ')}</Text>
          {t.capacityKg ? <Text style={s.idSub}>{t.capacityKg.toLocaleString('en-US')} kg</Text> : null}
        </View>
      )}

      <View style={s.body}>
        <View style={s.tags}>
          <View style={[s.state, { backgroundColor: booked ? '#FFFAEB' : '#F0FDF4' }]}>
            <View style={[s.dot, { backgroundColor: booked ? '#F59E0B' : '#16A34A' }]} />
            <Text style={[s.stateText, { color: booked ? AMBER : GREEN }]} numberOfLines={1}>{booked ?? 'Free'}</Text>
          </View>
          <View style={s.gps}>
            <View style={[s.dot, { backgroundColor: t.gpsLive ? '#16A34A' : '#A1A1AA' }]} />
            <Text style={s.gpsText}>{t.gpsLive ? 'GPS' : 'No GPS'}</Text>
          </View>
        </View>

        <View style={s.driver}>
          {driver ? (
            <>
              {driverPhoto ? <Image source={{ uri: driverPhoto }} style={s.avatar} /> : (
                <View style={[s.avatar, s.initials]}><Text style={s.initialsText}>{initialsOf(driver.name)}</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.driverName} numberOfLines={1}>{shortName(driver.name)}</Text>
                <Text style={s.meta} numberOfLines={1}>{driver.status ? niceName(driver.status.replace(/([a-z])([A-Z])/g, '$1 $2')) : 'Driver'}</Text>
              </View>
              {driver.phone ? (
                <TouchableOpacity style={s.call} onPress={() => { tap(); Linking.openURL(`tel:${driver.phone}`).catch(() => {}); }} hitSlop={6} accessibilityLabel={`Call ${driver.name}`}>
                  <Phone size={15} color="#16A34A" strokeWidth={2.4} />
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <>
              <View style={[s.avatar, s.initials, { backgroundColor: '#F4F4F5' }]}><UserX size={14} color="#A1A1AA" /></View>
              <Text style={[s.driverName, { color: RED, flex: 1 }]}>No driver</Text>
            </>
          )}
        </View>

        {doc ? (
          <View style={[s.doc, { backgroundColor: doc.bg }]}><Text style={[s.docText, { color: doc.color }]} numberOfLines={1}>{doc.text}</Text></View>
        ) : null}

        <TouchableOpacity style={s.book} onPress={() => { tap(); onBook(); }} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Book a trip on ${t.vehicle.plate_number}`}>
          <Plus size={15} color={Colors.white} strokeWidth={2.6} />
          <Text style={s.bookText}>Book trip</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  h2: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 14, fontWeight: '500', color: MUTED },

  // Bleed to the screen edges so the strips scroll under the page padding.
  bleed: { marginHorizontal: -16, flexGrow: 0 },
  chips: { gap: 6, paddingHorizontal: 16 },
  chip: { flexDirection: 'row', alignItems: 'baseline', gap: 5, height: 34, paddingHorizontal: 13, paddingTop: 8, borderRadius: 17, backgroundColor: Colors.white, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: INK, borderColor: INK },
  chipText: { fontSize: 13, fontWeight: '600', color: '#3F3F46' },
  chipCount: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chipOf: { fontSize: 12, color: '#A1A1AA', marginLeft: -4, fontVariant: ['tabular-nums'] },

  empty: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: LINE },
  emptyText: { fontSize: 14, color: MUTED },

  strip: { gap: 10, paddingHorizontal: 16 },
  card: { width: CARD_W, backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  // Square, like the trucks' designed photos.
  photo: { width: CARD_W - 2, height: CARD_W - 2, backgroundColor: Colors.white },
  idCard: { backgroundColor: INK, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 14 },
  idPlate: { fontSize: 24, fontWeight: '800', color: Colors.white, letterSpacing: 0.5, marginTop: 6 },
  idLine: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  idSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  tags: { flexDirection: 'row', gap: 6 },
  state: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  stateText: { fontSize: 12, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  gps: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#F4F4F5' },
  gpsText: { fontSize: 12, fontWeight: '600', color: '#52525B' },

  body: { padding: 11, gap: 1 },
  meta: { fontSize: 12, color: MUTED },
  driver: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  initials: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0EB' },
  initialsText: { fontSize: 11, fontWeight: '700', color: '#E8450F' },
  driverName: { fontSize: 13, fontWeight: '600', color: INK },
  call: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4' },
  doc: { alignSelf: 'flex-start', marginTop: 8, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, maxWidth: '100%' },
  docText: { fontSize: 11, fontWeight: '700' },
  book: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 11, backgroundColor: INK, marginTop: 10 },
  bookText: { fontSize: 13, fontWeight: '700', color: Colors.white },
});
