/**
 * Route: /trip-edit?id= — change a trip after it was created: its times, its
 * places and its price. Same rules and endpoints as the web's Edit Trip page:
 *
 *   times + route  PUT   /trips/:id/stops       Draft and Scheduled fully; a running trip only the stops not reached yet
 *   price          PATCH /trips/:id/financials  until the trip is invoiced
 *
 * Driver, truck, extra charges and the status are changed from the trip page
 * itself, so they are not repeated here. Only what was changed is sent.
 */
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarClock, Clock, Lock, MapPin, Plus, Route, Wallet, X } from 'lucide-react-native';
import { dateInZone, extraStopNote, findExtraStopRule, isRouteEditable, isStopReached, stopsEditMode, zonedWallTimeToUtcIso } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import {
  operatorService, invalidateOperatorTrips,
  type OperatorLocation, type OperatorTripDetail, type UpdateTripRouteInput,
} from '../../../lib/operator';
import { Field, FormHeader, SaveBar, Section, formStyles } from '@/features/users/components/FormKit';
import { PickerSheet, ValueTile, fmtDay, niceName, tap } from '../create/components/ui';
import { WhenSheet, type WhenValue } from '../create/components/WhenSheet';
import { deltaText, moveTrips, tripsMadeWith } from './movePlan';
import { ExtraStopSheet, type ExtraStopSheetValue } from './ExtraStopSheet';
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
  /** The driver has already been here — locked. */
  reached: boolean;
  /** The arrival time was set by hand on this page (so it doesn't move with the pickup). */
  timeSet?: boolean;
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

/** A two-button question; resolves true for `yes`. */
const ask = (title: string, message: string, yes: string, no: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: no, style: 'cancel', onPress: () => resolve(false) },
      { text: yes, onPress: () => resolve(true) },
    ], { cancelable: false }),
  );

const isoMs = (w: WhenValue, tz: string) => (w.date && w.time ? Date.parse(zonedWallTimeToUtcIso(w.date, w.time, tz)) : null);
const shiftIso = (iso: string | null, deltaMs: number) => (iso && deltaMs ? new Date(Date.parse(iso) + deltaMs).toISOString() : iso);

/** "8 h 30 m" for a transit time in minutes. */
const transitText = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h} h ${m} m` : h ? `${h} h` : `${m} m`;
};
/** Transit times offered: every 30 minutes up to two days. */
const TRANSIT_CHOICES = Array.from({ length: 96 }, (_, i) => (i + 1) * 30);

function TripForm({ trip, tz, onDone }: { trip: OperatorTripDetail; tz: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const status = trip.status as string;
  const routeOpen = isRouteEditable(status);
  // A running trip still takes stops the driver has not reached yet; finished trips take none.
  const stopsOpen = stopsEditMode(status) !== 'locked';
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
    reached: isStopReached(st),
  })), [trip]);
  const initialStart = useMemo(() => wallOf(trip.planned_start, tz), [trip, tz]);
  const initialEnd = useMemo(() => wallOf(trip.planned_end, tz), [trip, tz]);
  const initialBilling = numText(trip.billing_amount);
  const initialPayout = numText(trip.driver_payout ?? trip.driver_charge ?? trip.trip_charges);

  const [stops, setStops] = useState<StopDraft[]>(initialStops);
  const [start, setStart] = useState<WhenValue>(initialStart);
  const [end, setEnd] = useState<WhenValue>(initialEnd);
  // Until the delivery is set by hand, it moves with the pickup so the trip keeps its length.
  const [endTouched, setEndTouched] = useState(false);
  const [endFollowed, setEndFollowed] = useState(false);
  const moveStart = (v: WhenValue) => {
    setStart(v);
    const was = isoMs(start, tz);
    const now = isoMs(v, tz);
    const endAt = isoMs(end, tz);
    if (!endTouched && was != null && now != null && endAt != null && now !== was) {
      setEnd(wallOf(new Date(endAt + (now - was)).toISOString(), tz));
      setEndFollowed(true);
    }
  };
  const [billing, setBilling] = useState(initialBilling);
  const [payout, setPayout] = useState(initialPayout);

  const [locations, setLocations] = useState<OperatorLocation[]>([]);
  const [when, setWhen] = useState<'start' | 'end' | null>(null);
  // Transit time = delivery − pickup; picking one moves the delivery (TestFlight feedback).
  const [transitPicker, setTransitPicker] = useState(false);
  const startMs = isoMs(start, tz);
  const endMs = isoMs(end, tz);
  const transitMin = startMs != null && endMs != null && endMs > startMs ? Math.round((endMs - startMs) / 60000) : null;
  const [stopWhen, setStopWhen] = useState<string | null>(null);
  const [stopPicker, setStopPicker] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [extra, setExtra] = useState<null | { added: number; rate: number | null; ruleId: string | null; unit: string | null; chargeType: string }>(null);
  const [extraSaving, setExtraSaving] = useState(false);

  const customerId = trip.customer?.id;
  useEffect(() => {
    if (!customerId || !stopsOpen) return;
    let live = true;
    operatorService.locations(customerId).then((l) => { if (live) setLocations(l); }).catch(() => {});
    return () => { live = false; };
  }, [customerId, stopsOpen]);

  const [today] = useState(() => dateInZone(Date.now(), tz));
  const oneWay = stops.every((st) => st.leg_index === 0);
  const legs = Array.from(new Set(stops.map((st) => st.leg_index)));
  // First and last stop of a leg (pickup / drop-off) are fixed; stops in between can be added or removed, on either leg.
  const legEdge = (i: number) => i === 0 || i === stops.length - 1 || stops[i - 1].leg_index !== stops[i].leg_index || stops[i + 1].leg_index !== stops[i].leg_index;
  // On a running trip only unreached middle stops can change; reached ones stay locked.
  const editable = (i: number) => routeOpen || (stopsOpen && !stops[i].reached && !legEdge(i));
  // No stop can be slotted in before one the driver is already past.
  const legClosed = (leg: number) => !routeOpen && (
    stops.some((st) => st.leg_index > leg && st.reached) ||
    stops.filter((st) => st.leg_index === leg).slice(-1)[0]?.reached === true
  );
  const added = stops.filter((st) => st.key.startsWith('new')).length;

  const scheduleChanged = start.date !== initialStart.date || start.time !== initialStart.time || end.date !== initialEnd.date || end.time !== initialEnd.time;
  const routeChanged = stops.length !== initialStops.length || stops.some((st, i) => st.changed || st.timeSet || st.key !== initialStops[i]?.key);
  const billingChanged = billingOpen && billing !== initialBilling;
  const payoutChanged = payoutOpen && payout !== initialPayout;
  const routeSave = routeOpen ? scheduleChanged || routeChanged : stopsOpen && routeChanged;
  const dirty = routeSave || billingChanged || payoutChanged;

  const clear = (k: keyof Errors) => errors[k] && setErrors((prev) => ({ ...prev, [k]: undefined }));

  const setStop = (key: string, patch: Partial<StopDraft>) => {
    setStops((list) => list.map((st) => (st.key === key ? { ...st, ...patch, changed: true } : st)));
    clear('route');
  };
  const addStop = (leg: number) => setStops((list) => {
    let at = list.length - 1;
    list.forEach((st, i) => { if (st.leg_index === leg) at = i; });
    return [
      ...list.slice(0, at),
      { key: `new${Date.now()}`, stop_type: 'Dropoff', leg_index: leg, rawName: '', name: '', locationId: null, lat: null, lng: null, planned_arrival: null, changed: true, reached: false },
      ...list.slice(at),
    ];
  });
  const removeStop = (key: string) => setStops((list) => list.filter((st) => st.key !== key));

  const stopLabel = (i: number) => {
    const st = stops[i];
    const back = st.leg_index > 0 ? ' (return)' : '';
    if (i === 0) return 'Pickup';
    if (legEdge(i) && st.leg_index > 0 && stops[i - 1].leg_index !== st.leg_index) return 'Return pickup';
    if (legEdge(i)) return `Drop-off${back}`;
    return `Stop ${i}${back}`;
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (routeSave) {
      if (stops.some((st) => !st.name.trim())) e.route = 'Choose a place for every stop';
      if (routeOpen && start.date && start.time && end.date && end.time) {
        const a = zonedWallTimeToUtcIso(start.date, start.time, tz);
        const b = zonedWallTimeToUtcIso(end.date, end.time, tz);
        if (new Date(b).getTime() <= new Date(a).getTime()) e.schedule = 'Delivery must be after pickup';
      }
    }
    if (billingChanged && !(parseFloat(billing) > 0)) e.billing = 'Enter the amount';
    if (payoutChanged && !(parseFloat(payout) >= 0)) e.payout = 'Enter the amount';
    return e;
  };

  // The Trips page and every trip screen read through React Query — refresh them all, not just the old cache.
  const refreshLists = () => {
    invalidateOperatorTrips();
    queryClient.invalidateQueries({ queryKey: ['trips'] });
    queryClient.invalidateQueries({ queryKey: ['trip'] });
  };

  const handleSave = async () => {
    if (saving || !dirty) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    let routeSaved = false;
    try {
      if (routeSave) {
        // A running trip keeps its times; only its stops change.
        const startIso = routeOpen && start.date && start.time ? zonedWallTimeToUtcIso(start.date, start.time, tz) : undefined;
        const endIso = routeOpen && end.date && end.time ? zonedWallTimeToUtcIso(end.date, end.time, tz) : undefined;
        // Stops in between keep their place in the plan: the way out moves with the pickup, the way back with the delivery.
        const startDelta = startIso && trip.planned_start ? Date.parse(startIso) - Date.parse(trip.planned_start) : 0;
        const endDelta = endIso && trip.planned_end ? Date.parse(endIso) - Date.parse(trip.planned_end) : startDelta;
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
            // First and last follow the trip's times; a middle stop moves with its leg's end of the trip.
            planned_arrival: !routeOpen ? st.planned_arrival : i === 0 ? startIso ?? st.planned_arrival : i === stops.length - 1 ? endIso ?? st.planned_arrival : st.timeSet ? st.planned_arrival : shiftIso(st.planned_arrival, st.leg_index > 0 ? endDelta : startDelta),
          })),
        };
        // A month plan / bulk booking: offer to move the trips made with this one by the same amount.
        const others = startDelta ? await tripsMadeWith(trip).catch(() => []) : [];
        const all = others.length > 0 && await ask(
          `Move the other ${others.length} ${others.length === 1 ? 'trip' : 'trips'} too?`,
          `${others.length === 1 ? 'It was' : 'They were'} created together with this one (same customer and driver). Move ${others.length === 1 ? 'it' : 'them'} ${deltaText(startDelta)} as well?`,
          `Move all ${others.length + 1}`,
          'Only this trip',
        );
        if (all) {
          const r = await moveTrips(others, startDelta, { trip, payload });
          if (!r.editedSaved) {
            if (r.moved) refreshLists();
            throw r.editedError ?? new Error('Could not move this trip');
          }
          routeSaved = true;
          if (r.failed.length) {
            Alert.alert(`Moved ${r.moved + 1} of ${others.length + 1} trips`, r.failed.map((x) => `${x.ref}: ${x.reason}`).join('\n'));
          }
        } else {
          await operatorService.updateTripRoute(trip.id, payload);
          routeSaved = true;
        }
      }
      if (billingChanged || payoutChanged) {
        await operatorService.updateTripPrice(trip.id, {
          ...(billingChanged ? { billing_amount: parseFloat(billing) } : {}),
          ...(payoutChanged ? { driver_payout: parseFloat(payout) } : {}),
        });
      }
      refreshLists();
      if (routeSaved && added > 0 && status !== 'Draft') {
        // Optional extra-stop charge, pre-filled from the customer's "additional stop" rule.
        let rule = null;
        try {
          if (customerId) rule = findExtraStopRule(await operatorService.surchargeRules({ customerId }));
        } catch { /* no rule to pre-fill — a rate can still be typed */ }
        setExtra({ added, rate: rule?.rate ?? null, ruleId: rule?.id ?? null, unit: rule?.unit ?? 'per stop', chargeType: rule?.charge_type || 'Additional Stop' });
        return;
      }
      onDone();
    } catch (err) {
      if (routeSaved) refreshLists();
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      Alert.alert(
        code === 'SCHEDULE_CLASH' ? 'That would double-book the trip' : routeSaved ? 'Times and route saved, price not saved' : 'Could not save the trip',
        getApiErrorMessage(err),
      );
    } finally {
      setSaving(false);
    }
  };

  const saveExtra = async (v: ExtraStopSheetValue) => {
    if (!extra) return;
    setExtraSaving(true);
    try {
      await operatorService.addExtraStop(trip.id, {
        ...(v.addCharge ? { charge: { surchargeRuleId: extra.ruleId, charge_type: extra.chargeType, unit: extra.unit, rate: v.rate, quantity: extra.added } } : {}),
        ...(v.payoutIncrease > 0 ? { driver_payout_increase: v.payoutIncrease } : {}),
      });
      refreshLists();
      setExtra(null);
      onDone();
    } catch (err) {
      Alert.alert('Stop saved, charge not saved', getApiErrorMessage(err));
    } finally {
      setExtraSaving(false);
    }
  };

  const picked = stopPicker ? stops.find((st) => st.key === stopPicker) : undefined;
  const lockedNote = stopsOpen
    ? `This trip is ${statusWord(status)}. Its times and the stops the driver has reached are locked — you can add or remove stops not reached yet.`
    : `This trip is ${statusWord(status)}, so its times and places can no longer be changed.`;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={formStyles.scroll} keyboardShouldPersistTaps="handled">
        {!routeOpen ? <LockNote text={lockedNote} /> : null}
        {extraStopNote(trip) ? <Text style={s.hint}>{extraStopNote(trip)}</Text> : null}

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
            <ValueTile
              style={(!routeOpen || startMs == null) && s.off}
              caption="Transit time"
              value={transitMin != null ? transitText(transitMin) : undefined}
              placeholder={startMs == null ? 'Set the pickup first' : 'Not set'}
              onPress={() => routeOpen && startMs != null && setTransitPicker(true)}
            />
          </View>
          {errors.schedule ? <Text style={s.error}>{errors.schedule}</Text> : null}
          {endFollowed && !endTouched ? <Text style={s.hint}>Delivery moved with the pickup, so the trip keeps its length. Tap Delivery to change it.</Text> : null}
        </Section>

        <Section title="Route" Icon={Route} note={routeOpen ? 'Tap a stop to change its place, or its time to change when it happens.' : stopsOpen ? 'Stops the driver has reached are locked.' : undefined}>
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
                    style={[s.stopBox, !editable(i) && s.off, errors.route && !st.name.trim() ? { borderColor: Colors.error } : null]}
                    activeOpacity={editable(i) ? 0.7 : 1}
                    onPress={() => editable(i) && setStopPicker(st.key)}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.stopCap}>{stopLabel(i)}</Text>
                      <Text style={[s.stopName, !st.name && { color: Colors.gray400, fontWeight: '400' }]} numberOfLines={1}>
                        {st.name ? niceName(st.name) : 'Choose a place'}
                      </Text>
                      {!edge ? (
                        <TouchableOpacity
                          style={[s.stopTime, !st.planned_arrival && s.stopTimeMissing]}
                          onPress={() => routeOpen && setStopWhen(st.key)}
                          activeOpacity={routeOpen ? 0.7 : 1}
                          accessibilityLabel={`Time at ${stopLabel(i)}`}
                        >
                          <Clock size={13} color={st.planned_arrival ? Colors.gray500 : '#B54708'} />
                          <Text style={[s.stopTimeText, !st.planned_arrival && { color: '#B54708' }]} numberOfLines={1}>
                            {st.planned_arrival ? `${st.stop_type === 'Pickup' ? 'Pickup' : 'Arrive'} ${whenText(wallOf(st.planned_arrival, tz))}` : routeOpen ? 'Set the time' : 'No time set'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {st.reached ? <Lock size={15} color={Colors.gray400} /> : !editable(i) ? null : legEdge(i) ? <MapPin size={16} color={Colors.gray400} /> : (
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
          {stopsOpen ? legs.filter((leg) => !legClosed(leg)).map((leg) => (
            <TouchableOpacity key={leg} style={s.addStop} activeOpacity={0.75} onPress={() => { tap(); addStop(leg); }}>
              <Plus size={15} color={Colors.charcoal} strokeWidth={2.4} />
              <Text style={s.addStopText}>{oneWay ? 'Add a stop on the way' : leg === 0 ? 'Add a stop on the way out' : 'Add a stop on the way back'}</Text>
            </TouchableOpacity>
          )) : null}
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

      <ExtraStopSheet
        visible={!!extra}
        added={extra?.added ?? 0}
        defaultRate={extra?.rate ?? null}
        chargeType={extra?.chargeType ?? 'Additional Stop'}
        hasDriver={!!trip.driver && !trip.is_third_party}
        saving={extraSaving}
        onSkip={() => { setExtra(null); onDone(); }}
        onSave={saveExtra}
      />
      <WhenSheet
        visible={!!stopWhen}
        title={stopWhen ? `Time at ${stopLabel(stops.findIndex((x) => x.key === stopWhen))}` : ''}
        mode="datetime"
        value={(() => {
          const st = stops.find((x) => x.key === stopWhen);
          const w = st?.planned_arrival ? wallOf(st.planned_arrival, tz) : null;
          return { date: w?.date || start.date || today, time: w?.time || '' };
        })()}
        from={start.date && start.time ? start : undefined}
        today={today}
        tz={tz}
        onDone={(v) => {
          const key = stopWhen;
          setStopWhen(null);
          if (!key || !v.date || !v.time) return;
          const iso = zonedWallTimeToUtcIso(v.date, v.time, tz);
          setStops((list) => list.map((x) => (x.key === key ? { ...x, planned_arrival: iso, timeSet: true } : x)));
        }}
        onClose={() => setStopWhen(null)}
      />
      <WhenSheet
        visible={when === 'start'}
        title="Pickup"
        mode="datetime"
        value={{ date: start.date || today, time: start.time }}
        today={today}
        tz={tz}
        onDone={(v) => { moveStart(v); clear('schedule'); setWhen(null); }}
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
        onDone={(v) => { setEnd(v); setEndTouched(true); clear('schedule'); setWhen(null); }}
        onClose={() => setWhen(null)}
      />
      <PickerSheet
        visible={transitPicker}
        title="Transit time"
        options={TRANSIT_CHOICES.map((m) => ({
          value: String(m),
          label: transitText(m),
          sub: startMs != null ? `Delivery ${whenText(wallOf(new Date(startMs + m * 60000).toISOString(), tz))}` : undefined,
        }))}
        value={transitMin != null ? String(Math.round(transitMin / 30) * 30) : null}
        onSelect={(value) => {
          if (startMs == null) return;
          setEnd(wallOf(new Date(startMs + Number(value) * 60000).toISOString(), tz));
          setEndTouched(true);
          clear('schedule');
        }}
        onClose={() => setTransitPicker(false)}
        searchPlaceholder="Hours, e.g. 8"
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
  stopTime: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: Colors.gray100 },
  stopTimeMissing: { backgroundColor: '#FEF0C7' },
  stopTimeText: { fontSize: 12, fontWeight: '600', color: Colors.gray600 },
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
