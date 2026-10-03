/**
 * Route: /vehicle-details?id=… — one truck, laid out like the trip page: the map
 * on top, a summary card with four actions, then tabs (Overview · Trips ·
 * Documents · Service) so each screenful answers one question.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Image, Linking, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, FileText, MapPin, MessageCircle, Navigation, Phone, Satellite, SquarePen, Truck, UserRoundCog, Wrench, type LucideIcon } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { truckClassOfVehicle } from '@mercon/shared-types';
import { DriverAvatar } from '../../drivers/components/DriverAvatar';
import { operatorService, type OperatorDriverOption } from '../../../lib/operator';
import { SAUDI_CITY_COORDS } from '../../trips/services/travelTimeService';
import { TONE, statusChip, haversineKm, type Tone } from '../../trips/details/tripDetailsModel';
import { Card, Chip, InfoRow, INK, MUTED, PAGE, tap } from '../../trips/details/components/parts';
import { PickerSheet, SkeletonRows, fmtDay, fmtSar, initialsOf, niceName } from '../../trips/create/components/ui';
import { VehicleLocationMap, mapsUrl } from './VehicleLocationMap';
import { daysUntil, slotState, useVehicleDetail } from './useVehicleDetail';
import type { VehicleDocSlot, VehicleTrip } from './vehicleDetailApi';

type Tab = 'overview' | 'trips' | 'documents' | 'service';

const VEHICLE_STATUS: Record<string, { label: string; tone: Tone }> = {
  Available: { label: 'Available', tone: 'green' },
  OnTrip: { label: 'On trip', tone: 'blue' },
  Maintenance: { label: 'In maintenance', tone: 'amber' },
  Inactive: { label: 'Inactive', tone: 'gray' },
};

const fullName = (d?: { first_name?: string; last_name?: string } | null) => (d ? niceName(`${d.first_name || ''} ${d.last_name || ''}`.trim()) : '');
const digits = (p?: string | null) => (p ?? '').replace(/[^0-9]/g, '');
/** 05XXXXXXXX → 9665XXXXXXXX for WhatsApp. */
const waNumber = (p?: string | null) => {
  const d = digits(p);
  if (d.startsWith('966')) return d;
  if (d.startsWith('0')) return `966${d.slice(1)}`;
  return d.length === 9 ? `966${d}` : d;
};

/** The nearest known city and how far it is. Never invents a street address. */
function nearestCityWithin(lat: number, lng: number): { name: string; km: number } | null {
  let best: { name: string; km: number } | null = null;
  const seen = new Set<string>();
  for (const [key, [clat, clng]] of Object.entries(SAUDI_CITY_COORDS)) {
    const id = `${clat},${clng}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const km = haversineKm({ lat, lng }, { lat: clat, lng: clng });
    if (!best || km < best.km) best = { name: niceName(key.replace(/_/g, ' ')), km };
  }
  return best;
}

/** "Near Riyadh" within 80 km — used for the short map pill. */
function nearestCity(lat: number, lng: number): string | null {
  const c = nearestCityWithin(lat, lng);
  return c && c.km <= 80 ? c.name : null;
}

const routeOf = (t: VehicleTrip) => {
  const stops = [...(t.stops ?? [])].sort((a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0));
  const out = stops.filter((s) => (s.leg_index ?? 0) === 0);
  const from = niceName(out[0]?.location_name) || 'Pickup';
  const to = niceName(out[out.length - 1]?.location_name) || 'Drop-off';
  const round = stops.some((s) => (s.leg_index ?? 0) === 1);
  return { stops, from, to, round };
};

export default function VehicleDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [now, setNow] = useState(() => Date.now());
  const v = useVehicleDetail(String(id ?? ''), now);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [driverSheet, setDriverSheet] = useState(false);
  const [drivers, setDrivers] = useState<OperatorDriverOption[] | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const vehicle = v.vehicle;

  const refresh = async () => {
    setRefreshing(true);
    setNow(Date.now());
    try {
      await v.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const openDriverSheet = () => {
    tap();
    setDriverSheet(true);
    if (!drivers) operatorService.driversLookup().then(setDrivers).catch(() => setDrivers([]));
  };

  const confirmReassign = (toId: string) => {
    if (!vehicle) return;
    const current = vehicle.assignedDriver;
    const target = toId === '__none' ? null : drivers?.find((d) => d.id === toId) ?? null;
    if ((target?.id ?? null) === (current?.id ?? null)) return;
    const otherTruck = target?.assignedVehicle?.plate_number && target.assignedVehicle.id !== vehicle.id ? target.assignedVehicle.plate_number : null;
    const lines = [
      target ? `${fullName(target)} will drive ${vehicle.plate_number}.` : `${vehicle.plate_number} will have no driver.`,
      current ? `${fullName(current)} will no longer have this truck.` : '',
      otherTruck ? `${fullName(target)} currently has ${otherTruck}; that truck will be left without a driver.` : '',
    ].filter(Boolean);
    Alert.alert(target ? 'Change driver?' : 'Remove driver?', lines.join('\n\n'), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: target ? 'Change' : 'Remove',
        style: target ? 'default' : 'destructive',
        onPress: () =>
          v.reassign.mutate(target?.id ?? null, {
            onSuccess: () => setToast({ message: target ? `${fullName(target)} now drives ${vehicle.plate_number}.` : 'Driver removed.', type: 'success' }),
            onError: (e: any) => setToast({ message: e?.response?.data?.error?.message || e?.message || 'Driver not changed.', type: 'error' }),
          }),
      },
    ]);
  };

  const driverOptions = useMemo(
    () => [
      { value: '__none', label: 'No driver', sub: 'Leave this truck unassigned' },
      ...(drivers ?? [])
        .filter((d) => !`${d.first_name} ${d.last_name}`.toLowerCase().includes('audit'))
        .map((d) => {
          const other = d.assignedVehicle?.plate_number && d.assignedVehicle.id !== vehicle?.id ? d.assignedVehicle.plate_number : null;
          return {
            value: d.id,
            label: fullName(d),
            sub: [d.phone_primary, d.status && d.status !== 'Available' ? d.status : ''].filter(Boolean).join(' · ') || undefined,
            badge: other ? { label: `Has ${other}`, tone: 'warning' as const } : undefined,
            leading: <DriverAvatar initials={initialsOf(fullName(d))} avatarUrl={d.avatar_url || d.photo_url} size={32} />,
          };
        })
        .sort((a, b) => Number(Boolean(a.badge)) - Number(Boolean(b.badge)) || a.label.localeCompare(b.label)),
    ],
    [drivers, vehicle?.id],
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/vehicles'));

  if (v.loading || !vehicle) {
    return (
      <View style={[s.page, { paddingTop: insets.top + 8 }]}>
        <View style={s.plainBar}>
          <TouchableOpacity style={s.float} onPress={goBack} accessibilityLabel="Back">
            <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
        <View style={s.body}>
          {v.loading ? (
            <SkeletonRows rows={5} height={110} />
          ) : (
            <Card>
              <Text style={s.rowTitle}>{v.notFound ? 'Vehicle not found' : 'Couldn’t load this vehicle'}</Text>
              <Text style={s.sub}>{v.notFound ? 'It may have been removed.' : 'Go back and try again.'}</Text>
            </Card>
          )}
        </View>
      </View>
    );
  }

  const status = VEHICLE_STATUS[vehicle.status] ?? { label: vehicle.status, tone: 'gray' as Tone };
  const cls = truckClassOfVehicle(vehicle);
  const photo = resolveMediaUrl(vehicle.image_url);
  const loc = vehicle.resolved_location;
  const hasPos = loc && loc.latitude != null && loc.longitude != null;
  const fresh = loc?.display_state === 'CURRENT';
  const near = hasPos ? nearestCity(loc!.latitude!, loc!.longitude!) : null;
  const odoDays = vehicle.odometer_updated_at ? Math.floor((now - new Date(vehicle.odometer_updated_at).getTime()) / 86_400_000) : null;
  const odoStale = odoDays === null || odoDays >= 30;
  const workshop = vehicle.active_maintenance;
  const inWorkshop = Boolean(workshop && (workshop.status === 'In_Progress' || workshop.status === 'In Progress' || new Date(workshop.start_date).getTime() <= now));
  const liveTrip = v.trips.current ?? v.trips.next;
  // Where the position came from: the truck's own tracker, or (on an active trip) the driver's phone.
  const fromDriver = loc?.source === 'DRIVER_GPS';
  const coords = hasPos ? `${loc!.latitude!.toFixed(4)}, ${loc!.longitude!.toFixed(4)}` : null;
  const city = hasPos ? nearestCityWithin(loc!.latitude!, loc!.longitude!) : null;
  const place = !hasPos ? null : !city ? coords : city.km <= 80 ? `Near ${city.name}` : `${Math.round(city.km / 10) * 10} km from ${city.name}`;
  // Tracker state, from real fields only: no device id = none fitted; a fresh tracker fix = connected; otherwise it has gone quiet.
  const gps: { label: string; tone: Tone; note: string } = !vehicle.icces_device_id
    ? { label: 'Not installed', tone: 'gray', note: 'This truck has no GPS tracker.' }
    : loc?.source === 'PHYSICAL_GPS' && fresh
      ? { label: 'Connected', tone: 'green', note: 'The tracker is reporting now.' }
      : { label: 'Not connected', tone: 'red', note: loc?.source === 'PHYSICAL_GPS' && loc.formatted_time_ago ? `Last signal ${loc.formatted_time_ago}.` : 'No signal from the tracker.' };
  const driver = vehicle.assignedDriver;
  const phone = driver?.phone_primary || null;
  const openTrip = (tripId: string) => router.push({ pathname: '/trip-details', params: { id: tripId } });
  const editVehicle = () => router.push({ pathname: '/vehicle-edit', params: { id: vehicle.id } });

  // The four things an operator does from here — same row as the trip page.
  const actions: { key: string; label: string; icon: LucideIcon; onPress?: () => void }[] = [
    { key: 'call', label: 'Call', icon: Phone, onPress: phone ? () => Linking.openURL(`tel:${digits(phone)}`).catch(() => {}) : undefined },
    { key: 'wa', label: 'WhatsApp', icon: MessageCircle, onPress: phone ? () => Linking.openURL(`https://wa.me/${waNumber(phone)}`).catch(() => {}) : undefined },
    { key: 'map', label: 'Directions', icon: Navigation, onPress: hasPos ? () => Linking.openURL(mapsUrl(loc!.latitude!, loc!.longitude!)).catch(() => {}) : undefined },
    { key: 'driver', label: driver ? 'Change driver' : 'Assign driver', icon: UserRoundCog, onPress: openDriverSheet },
  ];

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'trips', label: 'Trips' },
    { id: 'documents', label: 'Docs', badge: v.docsNeedingAttention || undefined },
    { id: 'service', label: 'Service', badge: v.maintenance.open.length || undefined },
  ];

  return (
    <View style={s.page}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
      >
        {/* 0 · where it is — the map leads when the truck has a position */}
        {hasPos ? (
          <View style={s.mapClip}>
            <VehicleLocationMap lat={loc!.latitude!} lng={loc!.longitude!} fresh={fresh} height={MAP_H} bare />
            <View style={s.mapBottom}>
              <View style={s.mapPill}>
                <View style={[s.dot, { backgroundColor: fresh ? TONE.green.dot : TONE.amber.dot }]} />
                <Text style={s.mapPillText} numberOfLines={1}>
                  {[fresh ? 'Live' : `Seen ${loc?.formatted_time_ago || 'earlier'}`, loc?.speed_kph != null && fresh ? `${Math.round(loc.speed_kph)} km/h` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={{ height: insets.top + 60 }} />
        )}

        {/* 1 · which truck + the four actions */}
        <View style={s.summaryWrap}>
          <Card style={{ gap: 14 }}>
            <View style={s.row}>
              {photo ? (
                <Image source={{ uri: photo }} style={s.photo} resizeMode="cover" />
              ) : (
                <View style={[s.photo, s.photoEmpty]}>
                  <Truck size={24} color={MUTED} strokeWidth={1.9} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={s.plate} numberOfLines={1} adjustsFontSizeToFit selectable>{vehicle.plate_number}</Text>
                <Text style={s.sub} numberOfLines={1}>{[vehicle.ref_id, cls].filter(Boolean).join('  ·  ') || '—'}</Text>
              </View>
              <Chip label={vehicle.isActive === false ? 'Archived' : status.label} tone={vehicle.isActive === false ? 'gray' : status.tone} dot />
            </View>

            {!hasPos ? (
              <Text style={s.sub}>{vehicle.icces_device_id ? 'The tracker hasn’t sent a position yet.' : 'This truck has no GPS tracker.'}</Text>
            ) : null}

            <View style={s.actions}>
              {actions.map((a) => (
                <TouchableOpacity key={a.key} style={[s.action, !a.onPress && { opacity: 0.35 }]} disabled={!a.onPress} onPress={() => { tap(); a.onPress?.(); }} activeOpacity={0.7}>
                  <View style={s.actionIcon}>
                    <a.icon size={19} color={INK} strokeWidth={2} />
                  </View>
                  <Text style={s.actionText} numberOfLines={1}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        </View>

        {/* 2 · tabs */}
        <View style={s.tabsWrap}>
          <View style={s.tabs}>
            {tabs.map((t) => {
              const on = t.id === tab;
              return (
                <TouchableOpacity key={t.id} style={[s.tab, on && s.tabOn]} onPress={() => { if (!on) tap(); setTab(t.id); }} activeOpacity={0.8} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>{t.label}</Text>
                  {t.badge ? <View style={s.badge}><Text style={s.badgeText}>{t.badge}</Text></View> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 3 · tab body */}
        <View style={s.body}>
          {tab === 'overview' ? (
            <>
              {/* Where it is, in words, and whether the tracker is talking */}
              <Card>
                <Text style={s.label}>Location</Text>
                <View style={s.row}>
                  <View style={s.iconTile}>
                    <MapPin size={17} color={INK} strokeWidth={2.1} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1} selectable>{place ?? 'Location not available'}</Text>
                    <Text style={s.sub} numberOfLines={1}>
                      {hasPos
                        ? [fromDriver ? 'Driver’s phone' : 'Truck GPS', place !== coords ? coords : null].filter(Boolean).join('  ·  ')
                        :'Neither the truck nor its driver has sent a position.'}
                    </Text>
                  </View>
                </View>
                <View style={s.gpsRow}>
                  <View style={s.iconTile}>
                    <Satellite size={17} color={INK} strokeWidth={2.1} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text style={s.rowTitle}>GPS tracker</Text>
                    <Text style={s.sub} numberOfLines={1}>{gps.note}</Text>
                  </View>
                  <Chip label={gps.label} tone={gps.tone} dot />
                </View>
              </Card>

              {/* Who drives it */}
              <Card>
                <Text style={s.label}>Driver</Text>
                {driver ? (
                  <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => router.push({ pathname: '/driver-details', params: { id: driver.id } })}>
                    <DriverAvatar initials={initialsOf(fullName(driver))} avatarUrl={v.driverPhoto} size={44} />
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{fullName(driver)}</Text>
                      <Text style={s.sub} numberOfLines={1}>{phone || 'No phone number'}</Text>
                    </View>
                    <ChevronRight size={18} color="#A1A1AA" />
                  </TouchableOpacity>
                ) : (
                  <Text style={s.empty}>No driver yet — tap “Assign driver” above.</Text>
                )}
                {v.reassign.isPending ? <Text style={s.sub}>Saving…</Text> : null}
              </Card>

              {/* What it is doing — only when it is doing something */}
              {inWorkshop && workshop ? (
                <Card style={s.accentCard}>
                  <View style={[s.accent, { backgroundColor: TONE.amber.dot }]} />
                  <Text style={[s.label, { color: TONE.amber.fg }]}>In the workshop</Text>
                  <Text style={s.rowTitle} numberOfLines={1}>{niceName(workshop.maintenance_type)}</Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {niceName(workshop.workshop_name)} · since {fmtDay(workshop.start_date.slice(0, 10))}
                    {workshop.end_date ? ` · until ${fmtDay(workshop.end_date.slice(0, 10))}` : ''}
                  </Text>
                </Card>
              ) : null}
              {liveTrip ? <TripNow trip={liveTrip} upcoming={!v.trips.current} onOpen={() => openTrip(liveTrip.id)} /> : null}

              {/* This month */}
              <Card>
                <Text style={s.label}>This month</Text>
                {v.monthLoading ? (
                  <SkeletonRows rows={1} height={44} />
                ) : v.month ? (
                  <View style={s.figures}>
                    <Figure label="Trips" value={String(v.month.completed_trips_count)} />
                    <Figure label="Earned" value={fmtSar(v.month.total_income)} />
                    <Figure label="Costs" value={fmtSar(v.month.total_expenses)} />
                    <Figure
                      label="Profit"
                      value={v.month.total_income > 0 ? `${Math.round(v.month.margin_percent)}%` : '—'}
                      color={v.month.total_income <= 0 ? undefined : v.month.margin_percent >= 20 ? TONE.green.fg : v.month.margin_percent >= 5 ? TONE.amber.fg : TONE.red.fg}
                    />
                  </View>
                ) : (
                  <Text style={s.empty}>{v.monthError ? 'Couldn’t load this month’s numbers.' : 'No numbers yet.'}</Text>
                )}
              </Card>

              {/* The truck itself */}
              <Card style={{ paddingVertical: 4 }}>
                <TouchableOpacity disabled={!odoStale} onPress={editVehicle} activeOpacity={0.6}>
                  <InfoRow label="Odometer" value={`${Math.round(vehicle.current_odometer || 0).toLocaleString('en-US')} km`} last={odoStale} />
                </TouchableOpacity>
                {odoStale ? (
                  <TouchableOpacity style={s.hint} onPress={editVehicle} activeOpacity={0.6}>
                    <Text style={s.hintText}>{odoDays === null ? 'Odometer never updated' : `Odometer is ${odoDays} days old`}</Text>
                    <Text style={s.link}>Update</Text>
                  </TouchableOpacity>
                ) : null}
                <InfoRow label="Capacity" value={`${cls}  ·  ${(vehicle.capacity_kg || 0).toLocaleString('en-US')} kg`} />
                {vehicle.trailer_number ? (
                  <InfoRow
                    label="Trailer"
                    value={[vehicle.trailer_number, niceName(vehicle.trailer_type), vehicle.trailer_capacity_kg ? `${vehicle.trailer_capacity_kg.toLocaleString('en-US')} kg` : null].filter(Boolean).join(' · ')}
                  />
                ) : null}
                <InfoRow label="Tracker ID" value={vehicle.icces_device_id || 'None'} last />
              </Card>
            </>
          ) : null}

          {tab === 'trips' ? (
            <>
              <Card style={s.listCard}>
                {v.trips.recent.length === 0 ? (
                  <Text style={[s.empty, s.listEmpty]}>No trips yet.</Text>
                ) : (
                  v.trips.recent.map((t, i) => {
                    const r = routeOf(t);
                    const chip = statusChip(t.status);
                    const d = t.planned_start ? new Date(t.planned_start) : null;
                    return (
                      <TouchableOpacity key={t.id} style={[s.line, i > 0 && s.lineBorder]} activeOpacity={0.6} onPress={() => openTrip(t.id)}>
                        <View style={s.date}>
                          <Text style={s.dateDay}>{d ? d.getDate() : '—'}</Text>
                          <Text style={s.dateMonth}>{d ? d.toLocaleDateString(undefined, { month: 'short' }) : ''}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                          <Text style={s.rowTitle} numberOfLines={1}>
                            {r.from} → {r.to}
                            {r.round ? ' ↺' : ''}
                          </Text>
                          <Text style={s.sub} numberOfLines={1}>
                            {niceName(t.customer?.name) || fullName(t.driver) || t.ref_id || 'Trip'}
                          </Text>
                        </View>
                        <Chip label={chip.label} tone={chip.tone} />
                      </TouchableOpacity>
                    );
                  })
                )}
              </Card>
              {v.trips.total > v.trips.recent.length ? (
                <TouchableOpacity style={s.wideBtn} activeOpacity={0.8} onPress={() => router.push({ pathname: '/trips', params: { vehicleId: vehicle.id, plate: vehicle.plate_number } })}>
                  <Text style={s.wideBtnText}>See all {v.trips.total >= 100 ? '100+' : v.trips.total} trips</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}

          {tab === 'documents' ? (
            <Card style={s.listCard}>
              {v.docSlotsLoading ? (
                <View style={s.listEmpty}><SkeletonRows rows={3} height={32} /></View>
              ) : v.docSlotsError ? (
                <Text style={[s.empty, s.listEmpty]}>Couldn’t load the documents. Pull down to try again.</Text>
              ) : v.docSlots.length === 0 ? (
                <Text style={[s.empty, s.listEmpty]}>No document types are set up for trucks.</Text>
              ) : (
                v.docSlots.map((x, i) => <DocRow key={x.documentType.id} slot={x} first={i === 0} />)
              )}
            </Card>
          ) : null}

          {tab === 'service' ? (
            <Card style={s.listCard}>
              {v.maintenanceLoading ? (
                <View style={s.listEmpty}><SkeletonRows rows={2} height={32} /></View>
              ) : v.maintenance.all.length === 0 ? (
                <Text style={[s.empty, s.listEmpty]}>No maintenance recorded.</Text>
              ) : (
                v.maintenance.all.map((m, i) => {
                  const open = m.status !== 'Completed';
                  const when = (open ? m.start_date : m.service_date || m.start_date)?.slice(0, 10);
                  return (
                    <View key={m.id} style={[s.line, i > 0 && s.lineBorder]}>
                      <View style={[s.iconTile, { backgroundColor: open ? TONE.amber.bg : '#F4F4F5' }]}>
                        <Wrench size={16} color={open ? TONE.amber.fg : MUTED} strokeWidth={2.2} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <Text style={s.rowTitle} numberOfLines={1}>{niceName(m.maintenance_type)}</Text>
                        <Text style={s.sub} numberOfLines={1}>
                          {[niceName(m.workshop_name), when ? fmtDay(when) : null, Number(m.cost) > 0 ? `SAR ${fmtSar(Number(m.cost))}` : null].filter(Boolean).join('  ·  ')}
                        </Text>
                      </View>
                      <Chip label={open ? niceName(m.status.replace('_', ' ')) : 'Done'} tone={open ? 'amber' : 'gray'} />
                    </View>
                  );
                })
              )}
            </Card>
          ) : null}
        </View>
      </ScrollView>

      {/* Back and edit, floating over the map */}
      <TouchableOpacity style={[s.float, s.floatLeft, { top: insets.top + 8 }]} onPress={goBack} accessibilityLabel="Back">
        <ArrowLeft size={20} color={INK} strokeWidth={2.4} />
      </TouchableOpacity>
      <TouchableOpacity style={[s.float, s.floatRight, { top: insets.top + 8 }]} onPress={editVehicle} accessibilityLabel="Edit vehicle">
        <SquarePen size={18} color={INK} strokeWidth={2.2} />
      </TouchableOpacity>

      <PickerSheet
        visible={driverSheet}
        title={`Driver for ${vehicle.plate_number}`}
        options={drivers ? driverOptions : [{ value: '__loading', label: 'Loading drivers…', disabled: true }]}
        value={vehicle.assignedDriver?.id ?? '__none'}
        onSelect={(val) => val !== '__loading' && confirmReassign(val)}
        onClose={() => setDriverSheet(false)}
        searchPlaceholder="Name or phone"
      />
      <Toast visible={Boolean(toast)} message={toast?.message ?? ''} type={toast?.type ?? 'success'} onDismiss={() => setToast(null)} />
    </View>
  );
}

function Figure({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[s.figureValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.figureLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function TripNow({ trip, upcoming, onOpen }: { trip: VehicleTrip; upcoming: boolean; onOpen: () => void }) {
  const r = routeOf(trip);
  const chip = statusChip(trip.status);
  const tone = TONE[chip.tone];
  const total = r.stops.length;
  const arrived = r.stops.filter((x) => x.actual_arrival).length;
  const meta = upcoming
    ? `Starts ${trip.planned_start ? fmtDay(trip.planned_start.slice(0, 10)) : 'soon'}`
    : niceName(trip.customer?.name) || trip.ref_id || '';
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onOpen}>
      <Card>
        <View style={[s.row, { marginBottom: 12 }]}>
          <Text style={[s.label, { flex: 1, marginBottom: 0 }]}>{upcoming ? 'Next trip' : 'Current trip'}</Text>
          <Chip label={chip.label} tone={chip.tone} dot />
        </View>

        {/* From → to, as two stacked points joined by a line */}
        <View style={s.row}>
          <View style={s.rail}>
            <View style={s.railDot} />
            <View style={s.railLine} />
            <View style={[s.railDot, s.railDotEnd]} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
            <Text style={s.rowTitle} numberOfLines={1}>{r.from}</Text>
            <Text style={s.rowTitle} numberOfLines={1}>
              {r.to}
              {r.round ? <Text style={s.sub}>  · round trip</Text> : null}
            </Text>
          </View>
          <ChevronRight size={18} color="#A1A1AA" />
        </View>

        <View style={s.tripFoot}>
          <Text style={[s.sub, { flex: 1 }]} numberOfLines={1}>{meta}</Text>
          {!upcoming && total > 0 ? (
            <>
              <View style={s.steps}>
                {r.stops.map((x, i) => (
                  <View key={i} style={[s.step, { backgroundColor: x.actual_arrival ? tone.dot : '#E4E4E8' }]} />
                ))}
              </View>
              <Text style={s.sub}>{arrived}/{total} stops</Text>
            </>
          ) : null}
        </View>
      </Card>
    </TouchableOpacity>
  );
}

/** One document type and the current document filed under it — the same rows the web's vehicle documents page shows. */
function DocRow({ slot, first }: { slot: VehicleDocSlot; first: boolean }) {
  const st = slotState(slot);
  const days = daysUntil(slot.document?.expiry_date);
  const tone: Tone = st === 'expired' || st === 'missing' ? 'red' : st === 'expiring' ? 'amber' : 'green';
  const text =
    st === 'missing'
      ? 'Missing'
      : st === 'none'
        ? 'On file'
        : st === 'expired'
          ? -days! === 0 ? 'Expired today' : `Expired ${-days!}d ago`
          : st === 'expiring'
            ? `${days} day${days === 1 ? '' : 's'} left`
            : `Valid · ${fmtDay(slot.document!.expiry_date!.slice(0, 10))}`;
  const url = resolveMediaUrl(slot.document?.file_url || slot.document?.files?.[0]?.file_url);
  const quiet = st === 'missing';
  return (
    <TouchableOpacity style={[s.line, !first && s.lineBorder]} disabled={!url} activeOpacity={0.6} onPress={() => url && Linking.openURL(url)}>
      <View style={[s.iconTile, { backgroundColor: quiet ? '#F4F4F5' : TONE[tone].bg }]}>
        <FileText size={16} color={quiet ? MUTED : TONE[tone].fg} strokeWidth={2.2} />
      </View>
      <Text style={[s.rowTitle, { flex: 1 }, quiet && { color: MUTED }]} numberOfLines={1}>{slot.documentType.name}</Text>
      <Text style={[s.when, { color: st === 'valid' || st === 'none' ? MUTED : TONE[tone].fg }]}>{text}</Text>
      {url ? <ChevronRight size={16} color="#C4C4CC" /> : null}
    </TouchableOpacity>
  );
}

const MAP_H = 250;
const shadow = { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 } as const;

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE },
  plainBar: { paddingHorizontal: 16, paddingBottom: 8 },
  float: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', ...shadow },
  floatLeft: { position: 'absolute', left: 16 },
  floatRight: { position: 'absolute', right: 16 },

  mapClip: { height: MAP_H, overflow: 'hidden', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  mapBottom: { position: 'absolute', left: 16, right: 16, bottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapPill: { maxWidth: '75%', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.96)', ...shadow },
  mapPillText: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: INK },
  dot: { width: 8, height: 8, borderRadius: 4 },

  summaryWrap: { paddingHorizontal: 16, paddingTop: 12 },
  photo: { width: 64, height: 64, borderRadius: 14, backgroundColor: '#F4F4F5', borderWidth: 1, borderColor: '#E9E9EC' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  plate: { fontSize: 21, fontWeight: '800', color: INK, letterSpacing: 0.4 },
  actions: { flexDirection: 'row', paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12, fontWeight: '500', color: MUTED },

  tabsWrap: { backgroundColor: PAGE, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  tabs: { flexDirection: 'row', gap: 4, backgroundColor: '#EAEAED', borderRadius: 12, padding: 3 },
  tab: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: 38, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 2 },
  tabOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  tabTextOn: { color: INK, fontWeight: '700' },
  badge: { minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: TONE.amber.dot, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800', color: Colors.white },

  body: { paddingHorizontal: 16, gap: 10 },
  label: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: INK },
  sub: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  empty: { fontSize: 14, color: MUTED },
  link: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  accentCard: { overflow: 'hidden', gap: 8 },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  steps: { flexDirection: 'row', gap: 3 },
  step: { width: 14, height: 5, borderRadius: 3 },
  rail: { width: 12, alignItems: 'center', alignSelf: 'stretch', paddingVertical: 6 },
  railDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: INK, backgroundColor: Colors.white },
  railDotEnd: { backgroundColor: INK },
  railLine: { flex: 1, width: 2, backgroundColor: '#E4E4E8', marginVertical: 2 },
  tripFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F1F3' },

  figures: { flexDirection: 'row', gap: 10 },
  figureValue: { fontSize: 19, fontWeight: '700', color: INK, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  figureLabel: { fontSize: 12, color: MUTED },

  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: -2, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: TONE.amber.bg },
  hintText: { fontSize: 12.5, fontWeight: '600', color: TONE.amber.fg },

  listCard: { paddingVertical: 4 },
  listEmpty: { paddingVertical: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  lineBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  iconTile: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  when: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  date: { width: 40, height: 44, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 16, fontWeight: '700', color: INK, lineHeight: 18 },
  dateMonth: { fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase' },

  wideBtn: { height: 46, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#E9E9EC', alignItems: 'center', justifyContent: 'center' },
  wideBtnText: { fontSize: 14, fontWeight: '700', color: INK },
});
