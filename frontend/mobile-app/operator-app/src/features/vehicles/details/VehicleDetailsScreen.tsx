/**
 * Route: /vehicle-details?id=… — one truck: where it is, what it's doing, who
 * drives it, its papers, this month's money, recent trips, maintenance, specs.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Image, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft, ChevronRight, Coins, FileBadge, Info, ListChecks, MapPin, MessageCircle, Pencil, Phone, Route, Truck, User, Wrench,
} from 'lucide-react-native';
import { Colors, Spacing } from '@mercon/mobile-shared/theme/tokens';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { truckClassOfVehicle } from '@mercon/shared-types';
import { DriverAvatar } from '../../drivers/components/DriverAvatar';
import { operatorService, type OperatorDriverOption } from '../../../lib/operator';
import { SAUDI_CITY_COORDS } from '../../trips/services/travelTimeService';
import { TONE, statusChip, haversineKm } from '../../trips/details/tripDetailsModel';
import { Chip, PickerSheet, Section, SkeletonRows, fmtDay, fmtSar, initialsOf, niceName, tap } from '../../trips/create/components/ui';
import { VehicleLocationMap } from './VehicleLocationMap';
import { daysUntil, docState, useVehicleDetail } from './useVehicleDetail';
import type { VehicleDocument, VehicleTrip } from './vehicleDetailApi';

const PAGE = '#EEF1F6';

const VEHICLE_STATUS: Record<string, { label: string; tone: 'success' | 'accent' | 'warning' | 'neutral'; bg: string; fg: string }> = {
  Available: { label: 'Available', tone: 'success', bg: '#EAF3DE', fg: '#27500A' },
  OnTrip: { label: 'On trip', tone: 'accent', bg: '#E6F1FB', fg: '#0C447C' },
  Maintenance: { label: 'In maintenance', tone: 'warning', bg: '#FAEEDA', fg: '#633806' },
  Inactive: { label: 'Inactive', tone: 'neutral', bg: '#F1EFE8', fg: '#444441' },
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

/** The nearest known city within 80 km, for a "Near Riyadh" line. Never invents a street address. */
function nearestCity(lat: number, lng: number): string | null {
  let best: { name: string; km: number } | null = null;
  const seen = new Set<string>();
  for (const [key, [clat, clng]] of Object.entries(SAUDI_CITY_COORDS)) {
    const id = `${clat},${clng}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const km = haversineKm({ lat, lng }, { lat: clat, lng: clng });
    if (!best || km < best.km) best = { name: key.replace(/_/g, ' '), km };
  }
  return best && best.km <= 80 ? niceName(best.name) : null;
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const [now, setNow] = useState(() => Date.now());
  const v = useVehicleDetail(String(id ?? ''), now);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllDocs, setShowAllDocs] = useState(false);
  const [showAllMaint, setShowAllMaint] = useState(false);
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

  const top = (
    <View style={s.topBar}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
        <ChevronLeft size={24} color={Colors.charcoal} />
      </TouchableOpacity>
      <Text style={s.topTitle}>Vehicle</Text>
      {vehicle ? (
        <TouchableOpacity style={s.editBtn} onPress={() => router.push({ pathname: '/vehicle-edit', params: { id: vehicle.id } })} activeOpacity={0.75}>
          <Pencil size={14} color={Colors.charcoal} />
          <Text style={s.editText}>Edit</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (v.loading || !vehicle) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        {top}
        <View style={s.body}>
          {v.loading ? (
            <SkeletonRows rows={5} height={110} />
          ) : (
            <Section icon={Truck} tone="gray" title={v.notFound ? 'Vehicle not found' : 'Couldn’t load this vehicle'}>
              <Text style={s.muted}>{v.notFound ? 'It may have been removed.' : 'Pull down to try again.'}</Text>
            </Section>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const status = VEHICLE_STATUS[vehicle.status] ?? { label: vehicle.status, tone: 'neutral', bg: '#F1EFE8', fg: '#444441' };
  const cls = truckClassOfVehicle(vehicle);
  const photo = resolveMediaUrl(vehicle.image_url);
  const loc = vehicle.resolved_location;
  const hasPos = loc && loc.latitude != null && loc.longitude != null;
  const fresh = loc?.display_state === 'CURRENT';
  const near = hasPos ? nearestCity(loc!.latitude!, loc!.longitude!) : null;
  const odoDays = vehicle.odometer_updated_at ? Math.floor((now - new Date(vehicle.odometer_updated_at).getTime()) / 86_400_000) : null;
  const odoStale = odoDays === null || odoDays >= 30;
  const workshop = vehicle.active_maintenance;
  const liveTrip = v.trips.current ?? v.trips.next;
  const docs = showAllDocs ? v.documents : v.documents.slice(0, 3);
  const maint = showAllMaint ? v.maintenance.all : [...v.maintenance.open, ...v.maintenance.done.slice(0, 2)];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {top}
      <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}>
        {/* Identity */}
        <View style={s.hero}>
          {photo ? (
            <Image source={{ uri: photo }} style={s.photo} resizeMode="cover" />
          ) : (
            <View style={[s.photo, s.photoEmpty]}>
              <Truck size={30} color={Colors.primaryDark} strokeWidth={1.8} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.plate} numberOfLines={1}>
              {vehicle.plate_number}
            </Text>
            <Text style={s.heroSub} numberOfLines={1}>
              {[vehicle.ref_id, niceName(vehicle.asset_type), cls].filter(Boolean).join(' · ')}
            </Text>
            <View style={s.chips}>
              <View style={[s.pill, { backgroundColor: status.bg }]}>
                <Text style={[s.pillText, { color: status.fg }]}>{status.label}</Text>
              </View>
              {v.docsNeedingAttention ? (
                <View style={[s.pill, { backgroundColor: '#FAEEDA' }]}>
                  <Text style={[s.pillText, { color: '#633806' }]}>
                    {v.docsNeedingAttention} doc{v.docsNeedingAttention > 1 ? 's' : ''} need attention
                  </Text>
                </View>
              ) : null}
              {vehicle.isActive === false ? (
                <View style={[s.pill, { backgroundColor: '#F1EFE8' }]}>
                  <Text style={[s.pillText, { color: '#444441' }]}>Archived</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Where it is */}
        <Section
          icon={MapPin}
          tone="green"
          title="Where it is"
          badge={
            hasPos ? (
              <View style={[s.freshPill, { backgroundColor: fresh ? '#EAF3DE' : '#F1EFE8', marginLeft: 'auto' }]}>
                <View style={[s.freshDot, { backgroundColor: fresh ? '#639922' : '#888780' }]} />
                <Text style={[s.freshText, { color: fresh ? '#27500A' : '#444441' }]}>
                  {fresh ? 'Live' : 'Last known'}
                  {loc?.formatted_time_ago ? ` · ${loc.formatted_time_ago}` : ''}
                </Text>
              </View>
            ) : undefined
          }
        >
          {hasPos ? (
            <>
              <VehicleLocationMap lat={loc!.latitude!} lng={loc!.longitude!} fresh={fresh} />
              <Text style={[s.muted, { marginTop: 8 }]}>
                {[near ? `Near ${near}` : null, loc?.speed_kph != null && fresh ? `${Math.round(loc.speed_kph)} km/h` : null, loc?.source === 'PHYSICAL_GPS' ? 'GPS tracker' : loc?.source === 'DRIVER_GPS' ? "Driver's phone" : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </>
          ) : (
            <Text style={s.muted}>No location reported yet{vehicle.icces_device_id ? ' — the tracker hasn’t sent a position.' : ' — this truck has no GPS tracker.'}</Text>
          )}
        </Section>

        {/* In the workshop */}
        {workshop && (workshop.status === 'In_Progress' || workshop.status === 'In Progress' || new Date(workshop.start_date).getTime() <= now) ? (
          <Section icon={Wrench} tone="amber" title="In the workshop" highlight="warning">
            <Text style={s.strong}>{niceName(workshop.maintenance_type)}</Text>
            <Text style={s.muted}>
              {niceName(workshop.workshop_name)} · since {fmtDay(workshop.start_date.slice(0, 10))}
              {workshop.end_date ? ` · until ${fmtDay(workshop.end_date.slice(0, 10))}` : ''}
            </Text>
          </Section>
        ) : null}

        {/* Current / next trip */}
        {liveTrip ? <TripNow trip={liveTrip} upcoming={!v.trips.current} onOpen={() => router.push({ pathname: '/trip-details', params: { id: liveTrip.id } })} /> : null}

        {/* Driver */}
        <Section icon={User} tone="violet" title="Driver" action={{ label: vehicle.assignedDriver ? 'Change' : 'Assign', onPress: openDriverSheet }}>
          {vehicle.assignedDriver ? (
            <>
              <TouchableOpacity style={s.driverRow} activeOpacity={0.7} onPress={() => router.push({ pathname: '/driver-details', params: { id: vehicle.assignedDriver!.id } })}>
                <DriverAvatar initials={initialsOf(fullName(vehicle.assignedDriver))} avatarUrl={v.driverPhoto} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={s.strong}>{fullName(vehicle.assignedDriver)}</Text>
                  <Text style={s.muted}>{vehicle.assignedDriver.phone_primary || 'No phone number'}</Text>
                </View>
                <ChevronRight size={18} color={Colors.gray400} />
              </TouchableOpacity>
              {vehicle.assignedDriver.phone_primary ? (
                <View style={s.actions}>
                  <TouchableOpacity style={[s.action, { backgroundColor: Colors.gray100 }]} onPress={() => Linking.openURL(`tel:${digits(vehicle.assignedDriver!.phone_primary)}`)} activeOpacity={0.75}>
                    <Phone size={15} color={Colors.charcoal} />
                    <Text style={s.actionText}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.action, { backgroundColor: '#EAF3DE' }]}
                    onPress={() => Linking.openURL(`https://wa.me/${waNumber(vehicle.assignedDriver!.phone_primary)}`)}
                    activeOpacity={0.75}
                  >
                    <MessageCircle size={15} color="#27500A" />
                    <Text style={[s.actionText, { color: '#27500A' }]}>WhatsApp</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          ) : (
            <Text style={s.muted}>No driver assigned to this truck.</Text>
          )}
          {v.reassign.isPending ? <Text style={[s.muted, { marginTop: 6 }]}>Saving…</Text> : null}
        </Section>

        {/* Documents */}
        <Section
          icon={FileBadge}
          tone="amber"
          title="Documents"
          badge={v.documents.length ? <Chip label={String(v.documents.length)} /> : undefined}
          action={v.documents.length > 3 ? { label: showAllDocs ? 'Less' : `All ${v.documents.length}`, onPress: () => setShowAllDocs((x) => !x) } : undefined}
        >
          {v.documents.length === 0 ? <Text style={s.muted}>No documents uploaded for this truck.</Text> : docs.map((d, i) => <DocRow key={d.id} d={d} first={i === 0} />)}
        </Section>

        {/* This month */}
        <Section icon={Coins} tone="green" title="This month">
          {v.monthLoading ? (
            <SkeletonRows rows={1} height={56} />
          ) : v.month ? (
            <>
              <View style={s.kpis}>
                <Kpi label="Earned" value={fmtSar(v.month.total_income)} />
                <Kpi label="Costs" value={fmtSar(v.month.total_expenses)} />
                <Kpi
                  label="Profit"
                  value={v.month.total_income > 0 ? `${Math.round(v.month.margin_percent)}%` : '—'}
                  color={v.month.total_income <= 0 ? undefined : v.month.margin_percent >= 20 ? '#27500A' : v.month.margin_percent >= 5 ? '#854F0B' : '#A32D2D'}
                  sub={v.month.total_income > 0 ? `SAR ${fmtSar(v.month.net_profit)}` : undefined}
                />
              </View>
              <Text style={[s.muted, { marginTop: 8 }]}>
                {[
                  `${v.month.completed_trips_count} trip${v.month.completed_trips_count === 1 ? '' : 's'}`,
                  v.month.total_distance_km ? `${Math.round(v.month.total_distance_km).toLocaleString('en-US')} km` : null,
                  v.month.driver_charges ? `drivers ${fmtSar(v.month.driver_charges)}` : null,
                  v.month.fuel_expenses ? `fuel ${fmtSar(v.month.fuel_expenses)}` : null,
                  v.month.maintenance_expenses ? `maintenance ${fmtSar(v.month.maintenance_expenses)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </>
          ) : (
            <Text style={s.muted}>{v.monthError ? 'Couldn’t load this month’s numbers.' : 'No numbers yet.'}</Text>
          )}
        </Section>

        {/* Recent trips */}
        <Section
          icon={ListChecks}
          tone="coral"
          title="Recent trips"
          action={v.trips.total > 0 ? { label: `All ${v.trips.total >= 100 ? '100+' : v.trips.total}`, onPress: () => router.push({ pathname: '/trips', params: { vehicleId: vehicle.id, plate: vehicle.plate_number } }) } : undefined}
        >
          {v.trips.recent.length === 0 ? (
            <Text style={s.muted}>No trips yet.</Text>
          ) : (
            v.trips.recent.map((t, i) => {
              const r = routeOf(t);
              const chip = statusChip(t.status);
              const tone = TONE[chip.tone];
              return (
                <TouchableOpacity key={t.id} style={[s.listRow, i === 0 && { borderTopWidth: 0 }]} activeOpacity={0.6} onPress={() => router.push({ pathname: '/trip-details', params: { id: t.id } })}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>
                      {r.from} → {r.to}
                      {r.round ? ' ↺' : ''}
                    </Text>
                    <Text style={s.muted} numberOfLines={1}>
                      {[t.planned_start ? fmtDay(t.planned_start.slice(0, 10)) : null, fullName(t.driver) || null, niceName(t.customer?.name) || null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={[s.pill, { backgroundColor: tone.bg }]}>
                    <Text style={[s.pillText, { color: tone.fg }]}>{chip.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </Section>

        {/* Maintenance */}
        <Section icon={Wrench} tone="gray" title="Maintenance">
          {v.maintenanceLoading ? (
            <SkeletonRows rows={2} height={36} />
          ) : v.maintenance.all.length === 0 ? (
            <Text style={s.muted}>No maintenance recorded.</Text>
          ) : (
            <>
              {maint.map((m, i) => {
                const open = m.status !== 'Completed';
                const when = (open ? m.start_date : m.service_date || m.start_date)?.slice(0, 10);
                return (
                  <View key={m.id} style={[s.listRow, i === 0 && { borderTopWidth: 0 }]}>
                    <View style={[s.pill, { backgroundColor: open ? '#FAEEDA' : '#F1EFE8' }]}>
                      <Text style={[s.pillText, { color: open ? '#633806' : '#444441' }]}>{open ? niceName(m.status.replace('_', ' ')) : 'Done'}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>
                        {niceName(m.maintenance_type)}
                      </Text>
                      <Text style={s.muted} numberOfLines={1}>
                        {[niceName(m.workshop_name), Number(m.cost) > 0 ? `SAR ${fmtSar(Number(m.cost))}` : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Text style={s.muted}>{when ? fmtDay(when) : ''}</Text>
                  </View>
                );
              })}
              {v.maintenance.all.length > maint.length || showAllMaint ? (
                <TouchableOpacity onPress={() => setShowAllMaint((x) => !x)} hitSlop={8} style={{ paddingTop: 8 }}>
                  <Text style={s.link}>{showAllMaint ? 'Show less' : `Show all ${v.maintenance.all.length}`}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </Section>

        {/* Specs */}
        <Section icon={Info} tone="gray" title="Specs">
          <Spec
            label="Odometer"
            value={`${Math.round(vehicle.current_odometer || 0).toLocaleString('en-US')} km`}
            right={
              odoStale ? (
                <TouchableOpacity onPress={() => router.push({ pathname: '/vehicle-edit', params: { id: vehicle.id } })} hitSlop={8}>
                  <Chip label={odoDays === null ? 'never updated' : `updated ${odoDays} d ago`} tone="warning" />
                </TouchableOpacity>
              ) : undefined
            }
            first
          />
          <Spec label="Capacity" value={`${(vehicle.capacity_kg || 0).toLocaleString('en-US')} kg · ${cls}`} />
          <Spec label="Type" value={niceName(vehicle.asset_type)} />
          {vehicle.trailer_number ? (
            <Spec
              label="Trailer"
              value={[vehicle.trailer_number, niceName(vehicle.trailer_type), vehicle.trailer_capacity_kg ? `${vehicle.trailer_capacity_kg.toLocaleString('en-US')} kg` : null].filter(Boolean).join(' · ')}
            />
          ) : null}
          <Spec label="GPS tracker" value={vehicle.icces_device_id || 'None'} />
          {vehicle.ref_id ? <Spec label="Fleet ID" value={vehicle.ref_id} /> : null}
        </Section>
      </ScrollView>

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
    </SafeAreaView>
  );
}

function TripNow({ trip, upcoming, onOpen }: { trip: VehicleTrip; upcoming: boolean; onOpen: () => void }) {
  const r = routeOf(trip);
  const chip = statusChip(trip.status);
  const tone = TONE[chip.tone];
  const total = r.stops.length;
  const arrived = r.stops.filter((x) => x.actual_arrival).length;
  const next = r.stops.find((x) => !x.actual_arrival);
  return (
    <Section icon={Route} tone="blue" title={upcoming ? 'Next trip' : 'Current trip'} action={{ label: 'Open', onPress: onOpen }}>
      <TouchableOpacity activeOpacity={0.7} onPress={onOpen}>
        <Text style={s.strong} numberOfLines={1}>
          {r.from} → {r.to}
          {r.round ? ' ↺' : ''}
        </Text>
        <View style={[s.chips, { marginTop: 4 }]}>
          <View style={[s.pill, { backgroundColor: tone.bg }]}>
            <Text style={[s.pillText, { color: tone.fg }]}>{chip.label}</Text>
          </View>
          <Text style={s.muted} numberOfLines={1}>
            {[trip.ref_id, niceName(trip.customer?.name)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {upcoming ? (
          <Text style={[s.muted, { marginTop: 6 }]}>
            Starts {trip.planned_start ? `${fmtDay(trip.planned_start.slice(0, 10))}` : 'soon'}
            {trip.driver ? ` · ${fullName(trip.driver)}` : ''}
          </Text>
        ) : total > 0 ? (
          <>
            <View style={s.progress}>
              <View style={[s.progressFill, { width: `${Math.max(6, Math.round((arrived / total) * 100))}%`, backgroundColor: tone.dot }]} />
            </View>
            <Text style={[s.muted, { marginTop: 5 }]}>
              {arrived} of {total} stops reached{next ? ` · next: ${niceName(next.location_name) || 'next stop'}` : ''}
            </Text>
          </>
        ) : null}
      </TouchableOpacity>
    </Section>
  );
}

function DocRow({ d, first }: { d: VehicleDocument; first: boolean }) {
  const st = docState(d);
  const days = daysUntil(d.expiry_date);
  const color = st === 'expired' ? '#E24B4A' : st === 'expiring' ? '#EF9F27' : st === 'valid' ? '#639922' : '#B4B2A9';
  const textColor = st === 'expired' ? '#A32D2D' : st === 'expiring' ? '#854F0B' : Colors.gray500;
  const text =
    st === 'none'
      ? 'no expiry date'
      : st === 'expired'
        ? `expired ${-days! === 0 ? 'today' : `${-days!} day${-days! === 1 ? '' : 's'} ago`}`
        : st === 'expiring'
          ? days === 0
            ? 'expires today'
            : `expires in ${days} day${days === 1 ? '' : 's'}`
          : `valid · ${fmtDay(d.expiry_date!.slice(0, 10))}`;
  const url = resolveMediaUrl(d.file_url);
  return (
    <TouchableOpacity style={[s.listRow, first && { borderTopWidth: 0 }]} disabled={!url} activeOpacity={0.6} onPress={() => url && Linking.openURL(url)}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={[s.rowTitle, { flex: 1 }]} numberOfLines={1}>
        {niceName(d.doc_type) || 'Document'}
      </Text>
      <Text style={[s.docWhen, { color: textColor }]}>{text}</Text>
    </TouchableOpacity>
  );
}

function Kpi({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, color ? { color } : null]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

function Spec({ label, value, right, first }: { label: string; value: string; right?: React.ReactNode; first?: boolean }) {
  return (
    <View style={[s.listRow, first && { borderTopWidth: 0 }]}>
      <Text style={[s.muted, { width: 96, marginTop: 0 }]}>{label}</Text>
      <Text style={[s.rowTitle, { flex: 1 }]} numberOfLines={1}>
        {value}
      </Text>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  topTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.charcoal },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.white },
  editText: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  body: { padding: Spacing.md, paddingBottom: 120, gap: Spacing.sm },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: Spacing.md, borderRadius: 18, backgroundColor: Colors.white },
  photo: { width: 84, height: 66, borderRadius: 14 },
  photoEmpty: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  plate: { fontSize: 22, fontWeight: '800', color: Colors.charcoal, letterSpacing: 0.5 },
  heroSub: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillText: { fontSize: 11, fontWeight: '700' },
  freshPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  freshDot: { width: 7, height: 7, borderRadius: 4 },
  freshText: { fontSize: 11, fontWeight: '700' },
  strong: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  muted: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  link: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: Spacing.md },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  actionText: { fontSize: 13, fontWeight: '700', color: Colors.charcoal },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.gray100 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.charcoal },
  dot: { width: 9, height: 9, borderRadius: 5 },
  docWhen: { fontSize: 12, fontWeight: '600' },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: Colors.gray100, borderRadius: 12, padding: 10 },
  kpiLabel: { fontSize: 11, color: Colors.gray500, fontWeight: '500' },
  kpiValue: { fontSize: 17, fontWeight: '800', color: Colors.charcoal, marginTop: 2 },
  kpiSub: { fontSize: 11, color: Colors.gray500, marginTop: 1 },
  progress: { height: 6, borderRadius: 3, backgroundColor: Colors.gray100, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
});
