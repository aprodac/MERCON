/**
 * Route: /trip-edit?id= — change a trip after it was created: its times, its
 * places and its price. Same rules and endpoints as the web's Edit Trip page:
 *
 *   times + route  PUT   /trips/:id/stops       Draft and Scheduled trips only
 *   price          PATCH /trips/:id/financials  until the trip is invoiced
 *
 * Driver, truck, extra charges and the status are changed from the trip page
 * itself, so they are not repeated here. Only what was changed is sent.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarClock, Lock, MapPin, Plus, Route, Wallet, X } from 'lucide-react-native';
import { dateInZone, isRouteEditable, zonedWallTimeToUtcIso } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import {
  operatorService, invalidateOperatorTrips,
  type OperatorLocation, type OperatorTripDetail, type UpdateTripRouteInput,
} from '../../../lib/operator';
import { Field, FormHeader, SaveBar, Section, formStyles } from '@/features/users/components/FormKit';
import { PickerSheet, ValueTile, fmtDay, niceName, tap } from '../create/components/ui';
import { WhenSheet, type WhenValue } from '../create/components/WhenSheet';
import { isMonthly, sortedStops, stopName } from '../details/tripDetailsModel';

interface StopDraft {
  key: string;
  stop_type: string;
  leg_index: number;
  /** What is sent back for an untouched stop (keeps the round-trip marker in the stored name). */
  rawName: string;
  /** What the operator sees. */
  name: string;
  locationId: string | null;
  lat: number | null;
  lng: number | null;
  planned_arrival: string | null;
  changed: boolean;
}

type Errors = Partial<Record<'schedule' | 'route' | 'billing' | 'payout', string>>;

const money = (v: string) => v.replace(/[^0-9.]/g, '');
const numText = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? '' : String(Number(v)));

/** An instant as the wall-clock date and time of the deployment's timezone. */
function wallOf(iso: string | null | undefined, tz: string): WhenValue {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  let time = '';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    time = `${parts.find((p) => p.type === 'hour')?.value ?? '00'}:${parts.find((p) => p.type === 'minute')?.value ?? '00'}`;
  } catch {
    time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return { date: dateInZone(d.getTime(), tz), time };
}

const whenText = (w: WhenValue) => (w.date && w.time ? `${fmtDay(w.date)} · ${w.time}` : '');

export default function EditTripScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<OperatorTripDetail | null>(null);
  const [tz, setTz] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    Promise.all([operatorService.tripById(id), operatorService.deploymentTimezone()])
      .then(([t, zone]) => { if (live) { setTrip(t); setTz(zone); } })
      .catch((e) => { if (live) setLoadError(getApiErrorMessage(e)); });
    return () => { live = false; };
  }, [id]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      <FormHeader
        title="Edit trip"
        subtitle={trip ? [trip.ref_id, niceName(trip.customer?.name)].filter(Boolean).join(' · ') : undefined}
        onBack={() => router.back()}
      />
      {loadError ? <Text style={formStyles.errorText}>{loadError}</Text>
        : !trip || !tz ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 48 }} />
        : <TripForm key={trip.id} trip={trip} tz={tz} onDone={() => router.back()} />}
    </SafeAreaView>
  );
}

function TripForm({ trip, tz, onDone }: { trip: OperatorTripDetail; tz: string; onDone: () => void }) {
  const status = trip.status as string;
  const routeOpen = isRouteEditable(status);
  const monthly = isMonthly(trip);
  const hasCoDriver = Number(trip.co_driver_payout) > 0;
  // Same locks as the web: the customer's price until the truck is on the road, the payout until it is invoiced.
  const billingOpen = !['InTransit', 'Completed', 'Invoiced', 'Cancelled'].includes(status) && !monthly;
  const payoutOpen = !['Invoiced', 'Cancelled'].includes(status) && !trip.is_third_party && !hasCoDriver;

  const initialStops = useMemo<StopDraft[]>(() => sortedStops(trip).map((st, i) => ({
    key: st.id,
    stop_type: st.stop_type,
    leg_index: st.leg_index ?? 0,
    rawName: st.location_name ?? st.location?.name ?? '',
    name: stopName(st, i),
    locationId: ((st as unknown as { locationId?: string | null }).locationId) ?? null,
    lat: Number.isFinite(st.location_lat) ? st.location_lat : null,
    lng: Number.isFinite(st.location_lng) ? st.location_lng : null,
    planned_arrival: st.planned_arrival,
    changed: false,
  })), [trip]);
  const initialStart = useMemo(() => wallOf(trip.planned_start, tz), [trip, tz]);
  const initialEnd = useMemo(() => wallOf(trip.planned_end, tz), [trip, tz]);
  const initialBilling = numText(trip.billing_amount);
  const initialPayout = numText(trip.driver_payout ?? trip.driver_charge ?? trip.trip_charges);

  const [stops, setStops] = useState<StopDraft[]>(initialStops);
  const [start, setStart] = useState<WhenValue>(initialStart);
  const [end, setEnd] = useState<WhenValue>(initialEnd);
  const [billing, setBilling] = useState(initialBilling);
  const [payout, setPayout] = useState(initialPayout);

  const [locations, setLocations] = useState<OperatorLocation[]>([]);
  const [when, setWhen] = useState<'start' | 'end' | null>(null);
  const [stopPicker, setStopPicker] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const customerId = trip.customer?.id;
  useEffect(() => {
    if (!customerId || !routeOpen) return;
    let live = true;
    operatorService.locations(customerId).then((l) => { if (live) setLocations(l); }).catch(() => {});
    return () => { live = false; };
  }, [customerId, routeOpen]);

  const [today] = useState(() => dateInZone(Date.now(), tz));
  // Stops can be added or removed on a one-way trip; a round trip keeps its two legs as they are.
  const oneWay = stops.every((st) => st.leg_index === 0);

  const scheduleChanged = start.date !== initialStart.date || start.time !== initialStart.time || end.date !== initialEnd.date || end.time !== initialEnd.time;
  const routeChanged = stops.length !== initialStops.length || stops.some((st, i) => st.changed || st.key !== initialStops[i]?.key);
  const billingChanged = billingOpen && billing !== initialBilling;
  const payoutChanged = payoutOpen && payout !== initialPayout;
  const dirty = (routeOpen && (scheduleChanged || routeChanged)) || billingChanged || payoutChanged;

  const clear = (k: keyof Errors) => errors[k] && setErrors((prev) => ({ ...prev, [k]: undefined }));

  const setStop = (key: string, patch: Partial<StopDraft>) => {
    setStops((list) => list.map((st) => (st.key === key ? { ...st, ...patch, changed: true } : st)));
    clear('route');
  };
  const addStop = () => setStops((list) => [
    ...list.slice(0, -1),
    { key: `new${Date.now()}`, stop_type: 'Dropoff', leg_index: 0, rawName: '', name: '', locationId: null, lat: null, lng: null, planned_arrival: null, changed: true },
    list[list.length - 1],
  ]);
  const removeStop = (key: string) => setStops((list) => list.filter((st) => st.key !== key));

  const stopLabel = (i: number) => {
    const st = stops[i];
    const back = st.leg_index > 0 ? ' (return)' : '';
    if (i === 0) return 'Pickup';
    if (i === stops.length - 1) return `Drop-off${back}`;
    return `Stop ${i}${back}`;
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (routeOpen) {
      if (stops.some((st) => !st.name.trim())) e.route = 'Choose a place for every stop';
      if (start.date && start.time && end.date && end.time) {
        const a = zonedWallTimeToUtcIso(start.date, start.time, tz);
        const b = zonedWallTimeToUtcIso(end.date, end.time, tz);
        if (new Date(b).getTime() <= new Date(a).getTime()) e.schedule = 'Delivery must be after pickup';
      }
    }
    if (billingChanged && !(parseFloat(billing) > 0)) e.billing = 'Enter the amount';
    if (payoutChanged && !(parseFloat(payout) >= 0)) e.payout = 'Enter the amount';
    return e;
  };

  const handleSave = async () => {
    if (saving || !dirty) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    let routeSaved = false;
    try {
      if (routeOpen && (scheduleChanged || routeChanged)) {
        const startIso = start.date && start.time ? zonedWallTimeToUtcIso(start.date, start.time, tz) : undefined;
        const endIso = end.date && end.time ? zonedWallTimeToUtcIso(end.date, end.time, tz) : undefined;
        const payload: UpdateTripRouteInput = {
          planned_start: startIso,
          planned_end: endIso,
          isRound: !oneWay,
          stops: stops.map((st, i) => ({
            stop_type: st.stop_type,
            leg_index: st.leg_index,
            location_id: st.locationId,
            location_name: st.changed ? st.name.trim() : st.rawName,
            lat: st.lat,
            lng: st.lng,
            // First and last follow the trip's times; a middle stop keeps its own time unless the schedule moved.
            planned_arrival: i === 0 ? startIso ?? st.planned_arrival : i === stops.length - 1 ? endIso ?? st.planned_arrival : scheduleChanged ? null : st.planned_arrival,
          })),
        };
        await operatorService.updateTripRoute(trip.id, payload);
        routeSaved = true;
      }
      if (billingChanged || payoutChanged) {
        await operatorService.updateTripPrice(trip.id, {
          ...(billingChanged ? { billing_amount: parseFloat(billing) } : {}),
          ...(payoutChanged ? { driver_payout: parseFloat(payout) } : {}),
        });
      }
      invalidateOperatorTrips();
      onDone();
    } catch (err) {
      if (routeSaved) invalidateOperatorTrips();
      Alert.alert(
        routeSaved ? 'Times and route saved, price not saved' : 'Could not save the trip',
        getApiErrorMessage(err),
      );
    } finally {
      setSaving(false);
    }
  };

  const picked = stopPicker ? stops.find((st) => st.key === stopPicker) : undefined;
  const lockedNote = `This trip is ${statusWord(status)}, so its times and places can no longer be changed.`;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={formStyles.scroll} keyboardShouldPersistTaps="handled">
        {!routeOpen ? <LockNote text={lockedNote} /> : null}

        <Section title="Schedule" Icon={CalendarClock}>
          <View style={{ gap: 8 }}>
            <ValueTile
              style={!routeOpen && s.off}
              caption="Pickup"
              value={whenText(start)}
              placeholder="Not set"
              error={!!errors.schedule}
              onPress={() => routeOpen && setWhen('start')}
            />
            <ValueTile
              style={!routeOpen && s.off}
              caption="Delivery"
              value={whenText(end)}
              placeholder="Not set"
              error={!!errors.schedule}
              onPress={() => routeOpen && setWhen('end')}
            />
          </View>
          {errors.schedule ? <Text style={s.error}>{errors.schedule}</Text> : null}
        </Section>

        <Section title="Route" Icon={Route} note={routeOpen ? 'Tap a stop to change its place.' : undefined}>
          <View style={{ gap: 8 }}>
            {stops.map((st, i) => {
              const edge = i === 0 || i === stops.length - 1;
              return (
                <View key={st.key} style={s.stopRow}>
                  <View style={s.rail}>
                    <View style={[s.pin, i === stops.length - 1 && s.pinEnd, !edge && s.pinMid]} />
                    {i < stops.length - 1 ? <View style={s.railLine} /> : null}
                  </View>
                  <TouchableOpacity
                    style={[s.stopBox, !routeOpen && s.off, errors.route && !st.name.trim() ? { borderColor: Colors.error } : null]}
                    activeOpacity={routeOpen ? 0.7 : 1}
                    onPress={() => routeOpen && setStopPicker(st.key)}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.stopCap}>{stopLabel(i)}</Text>
                      <Text style={[s.stopName, !st.name && { color: Colors.gray400, fontWeight: '400' }]} numberOfLines={1}>
                        {st.name ? niceName(st.name) : 'Choose a place'}
                      </Text>
                    </View>
                    {!routeOpen ? null : edge || !oneWay ? <MapPin size={16} color={Colors.gray400} /> : (
                      <TouchableOpacity onPress={() => removeStop(st.key)} hitSlop={10} accessibilityLabel={`Remove ${stopLabel(i)}`}>
                        <X size={17} color={Colors.gray500} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
          {errors.route ? <Text style={s.error}>{errors.route}</Text> : null}
          {routeOpen && oneWay ? (
            <TouchableOpacity style={s.addStop} activeOpacity={0.75} onPress={() => { tap(); addStop(); }}>
              <Plus size={15} color={Colors.charcoal} strokeWidth={2.4} />
              <Text style={s.addStopText}>Add a stop on the way</Text>
            </TouchableOpacity>
          ) : null}
        </Section>

        <Section title="Price" Icon={Wallet}>
          <View style={formStyles.row}>
            <View style={{ flex: 1 }}>
              <Field
                label="Customer pays"
                prefix="SAR"
                value={billing}
                onChangeText={(v) => { setBilling(money(v)); clear('billing'); }}
                keyboardType="decimal-pad"
                placeholder="0"
                editable={billingOpen}
                error={errors.billing}
              />
            </View>
            {!trip.is_third_party ? (
              <View style={{ flex: 1 }}>
                <Field
                  label="Driver payout"
                  prefix="SAR"
                  value={payout}
                  onChangeText={(v) => { setPayout(money(v)); clear('payout'); }}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  editable={payoutOpen}
                  error={errors.payout}
                />
              </View>
            ) : null}
          </View>
          {priceNotes({ status, monthly, billingOpen, payoutOpen, thirdParty: !!trip.is_third_party, hasCoDriver }).map((n) => (
            <View key={n} style={s.noteRow}>
              <Lock size={13} color={Colors.gray500} />
              <Text style={s.noteText}>{n}</Text>
            </View>
          ))}
          <Text style={s.hint}>Waiting, labour and other extras are added from the trip page under “Additional charges”.</Text>
        </Section>
      </ScrollView>

      <SaveBar label="Save changes" onPress={handleSave} saving={saving} disabled={!dirty} />

      <WhenSheet
        visible={when === 'start'}
        title="Pickup"
        mode="datetime"
        value={{ date: start.date || today, time: start.time }}
        today={today}
        tz={tz}
        onDone={(v) => { setStart(v); clear('schedule'); setWhen(null); }}
        onClose={() => setWhen(null)}
      />
      <WhenSheet
        visible={when === 'end'}
        title="Delivery"
        mode="datetime"
        value={{ date: end.date || start.date || today, time: end.time }}
        from={start.date && start.time ? start : undefined}
        today={today}
        tz={tz}
        onDone={(v) => { setEnd(v); clear('schedule'); setWhen(null); }}
        onClose={() => setWhen(null)}
      />
      <PickerSheet
        visible={!!stopPicker}
        title={picked ? stopLabel(stops.indexOf(picked)) : 'Place'}
        options={locations.map((l) => ({ value: l.id, label: niceName(l.name), sub: [l.city, l.address].filter(Boolean).join(' · ') || undefined }))}
        value={picked?.locationId}
        onSelect={(value) => {
          const loc = locations.find((l) => l.id === value);
          if (stopPicker && loc) setStop(stopPicker, { locationId: loc.id, name: loc.name, lat: loc.lat ?? null, lng: loc.lng ?? null });
        }}
        onCreate={(text) => { if (stopPicker) setStop(stopPicker, { locationId: null, name: text, lat: null, lng: null }); }}
        createLabel="Use"
        onClose={() => setStopPicker(null)}
        searchPlaceholder="Search or type a new place"
        emptyText="No saved places for this customer — type a name to add one"
      />
    </KeyboardAvoidingView>
  );
}

function statusWord(status: string): string {
  switch (status) {
    case 'Loading': return 'loading';
    case 'InTransit': return 'on the road';
    case 'Delayed': return 'on the road (delayed)';
    case 'Completed': return 'delivered';
    case 'Invoiced': return 'invoiced';
    case 'Cancelled': return 'cancelled';
    default: return status.toLowerCase();
  }
}

/** Why a price field can't be typed in, in the operator's words. */
function priceNotes(o: { status: string; monthly: boolean; billingOpen: boolean; payoutOpen: boolean; thirdParty: boolean; hasCoDriver: boolean }): string[] {
  const out: string[] = [];
  if (['Invoiced', 'Cancelled'].includes(o.status)) return [`The price is locked because this trip is ${statusWord(o.status)}.`];
  if (!o.billingOpen) {
    out.push(o.monthly
      ? 'Monthly contract: the customer’s price comes from the quotation, so change it there.'
      : `The customer’s price is locked once the trip is ${statusWord(o.status)}.`);
  }
  if (o.thirdParty) out.push('3rd party trip: the carrier’s cost is set when the trip is created.');
  else if (o.hasCoDriver) out.push('This trip has a co-driver, so the payout split is changed on the web dashboard.');
  return out;
}

function LockNote({ text }: { text: string }) {
  return (
    <View style={s.lock}>
      <Lock size={15} color="#854F0B" />
      <Text style={s.lockText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  off: { opacity: 0.6 },
  error: { fontSize: 12, color: Colors.error, marginTop: -4 },
  hint: { fontSize: 12, color: Colors.gray500 },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFBF2', borderWidth: 1, borderColor: '#FAC775', borderRadius: 14, padding: 12 },
  lockText: { flex: 1, fontSize: 13, color: '#854F0B', fontWeight: '500' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noteText: { flex: 1, fontSize: 12, color: Colors.gray500 },
  stopRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  rail: { width: 14, alignItems: 'center', paddingTop: 20 },
  pin: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5, borderColor: Colors.charcoal, backgroundColor: Colors.white },
  pinEnd: { backgroundColor: Colors.charcoal },
  pinMid: { width: 8, height: 8, borderRadius: 4, borderWidth: 0, backgroundColor: Colors.gray400, marginTop: 2 },
  railLine: { flex: 1, width: 1.5, backgroundColor: Colors.gray300, marginTop: 4, marginBottom: -24 },
  stopBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.gray200, backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 8,
  },
  stopCap: { fontSize: 11, fontWeight: '600', color: Colors.gray500 },
  stopName: { fontSize: 15, fontWeight: '600', color: Colors.charcoal, marginTop: 1 },
  addStop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.gray200, borderStyle: 'dashed', backgroundColor: Colors.gray50,
  },
  addStopText: { fontSize: 13, fontWeight: '600', color: Colors.charcoal },
});
