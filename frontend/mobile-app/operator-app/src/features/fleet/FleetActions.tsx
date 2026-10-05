/**
 * The Fleet map's two actions that change a trip (the web live map's status
 * menu and "Find a truck"). Both call the same endpoints the trip page does —
 * PATCH /trips/:id/status, POST /trips/:id/pickup/arrive, POST /trips/:id/dispatch
 * — which only Admin and Operator may call (tripRoutes.ts), and the operator
 * app only signs those roles in.
 *
 *   useTripActions   the trip's next step (nextActionFor — same button and
 *                    confirmations as the trip page) and Cancel, each behind a
 *                    confirm; refreshes the map's data after.
 *   FindTruckSheet   free trucks ranked by distance to the trip's pickup
 *                    (rankTrucksForTrip), road drive time for the closest
 *                    three, and a one-tap assign: the truck goes with the
 *                    trip's own driver, or its standing driver when the trip
 *                    has none. Rows that can't be sent in one tap say why.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { operatorService, type LiveUnit } from '../../lib/operator';
import { nextActionFor } from '../trips/details/tripDetailsModel';
import { niceName } from '../trips/create/components/ui';
import { formatDuration, formatKm, rankTrucksForTrip, type TruckCandidate } from './fleetModel';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const LINE = '#E9E9EC';
const RED = '#D92D20';

/** Only the closest few get a road-route lookup — each is a routing call. */
const ROUTED = 3;
const SHOWN = 12;

/** Everything the map, Home and the lists read about trips and trucks. */
function useRefreshFleet() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['fleet'] });
  };
}

export function useTripActions(onDone: (message: string) => void) {
  const refresh = useRefreshFleet();
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>, ok: string, failTitle: string) => {
    setBusy(true);
    try {
      await work();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      refresh();
      onDone(ok);
    } catch (e) {
      Alert.alert(failTitle, getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** The label of the trip's next step, or null when there is none from here. */
  const nextLabel = (status: string | null | undefined) => (status ? nextActionFor(status)?.label ?? null : null);

  const advance = (tripId: string, status: string, ref: string | null) => {
    const next = nextActionFor(status);
    if (!next) return;
    const go = () => run(() => next.run(tripId), `${ref ?? 'Trip'} · ${next.label}`, 'Could not update the trip');
    // Every step from the map is confirmed — a mis-tap on a moving map is easy.
    Alert.alert(
      next.confirm?.title ?? `${next.label}?`,
      next.confirm?.message ?? `${ref ?? 'This trip'} moves to its next step.`,
      [{ text: 'Not yet', style: 'cancel' }, { text: 'Confirm', onPress: go }],
    );
  };

  const cancel = (tripId: string, ref: string | null) => {
    Alert.alert(`Cancel ${ref ?? 'this trip'}?`, 'The driver and truck are freed. This cannot be undone.', [
      { text: 'Keep trip', style: 'cancel' },
      { text: 'Cancel trip', style: 'destructive', onPress: () => run(() => operatorService.updateTripStatus(tripId, 'Cancelled'), `${ref ?? 'Trip'} cancelled`, 'Could not cancel') },
    ]);
  };

  return { busy, nextLabel, advance, cancel };
}

/** A trip can take a truck from the map while it hasn't finished and isn't a 3PL job. */
export const canFindTruck = (t: { status: string; is_third_party?: boolean }) =>
  !t.is_third_party && !['Completed', 'Invoiced', 'Cancelled'].includes(t.status);

export function FindTruckSheet({ tripId, units, onClose, onAssigned }: {
  tripId: string | null; units: LiveUnit[]; onClose: () => void; onAssigned: (message: string) => void;
}) {
  const refresh = useRefreshFleet();
  const tripQ = useQuery({ queryKey: ['fleet', 'find-truck', tripId], queryFn: () => operatorService.tripById(tripId!), enabled: !!tripId });
  const trip = tripQ.data ?? null;
  const [sending, setSending] = useState<string | null>(null);

  const pickup = useMemo(() => {
    const st = [...(trip?.stops ?? [])]
      .sort((a, b) => a.stop_sequence - b.stop_sequence)
      .find((x) => x.location_lat != null && x.location_lng != null && !(x.location_lat === 0 && x.location_lng === 0));
    return st ? { lat: st.location_lat, lng: st.location_lng, name: st.location?.name ?? st.location_name ?? null } : null;
  }, [trip]);

  const candidates = useMemo<TruckCandidate[]>(() => {
    if (!trip || !pickup) return [];
    const driver = trip.driver ? { id: trip.driver.id, name: `${trip.driver.first_name} ${trip.driver.last_name}`.trim() } : null;
    return rankTrucksForTrip({ id: trip.id, driver }, pickup, units).slice(0, SHOWN);
  }, [trip, pickup, units]);

  // Road drive time for the closest few that can actually be sent.
  const routedKeys = candidates.filter((c) => !c.blocker).slice(0, ROUTED);
  const etaQ = useQuery({
    queryKey: ['fleet', 'find-truck-eta', tripId, routedKeys.map((c) => `${c.unit.key}@${c.unit.position!.lat.toFixed(3)},${c.unit.position!.lng.toFixed(3)}`).join('|')],
    queryFn: async () => {
      const res = await Promise.all(routedKeys.map((c) => operatorService.routeEstimate(c.unit.position!, pickup!)));
      return new Map(routedKeys.map((c, i) => [c.unit.key, res[i]]));
    },
    enabled: !!pickup && routedKeys.length > 0,
    staleTime: 2 * 60_000,
  });

  const assign = (c: TruckCandidate) => {
    if (!trip || c.blocker || !c.unit.vehicle) return;
    const plate = c.unit.vehicle.plate_number;
    const withDriver = !trip.driver && c.driver ? c.driver : null;
    const ref = trip.ref_id ?? 'this trip';
    const replacing = trip.vehicle?.plate_number && trip.vehicle.plate_number !== plate ? ` It replaces ${trip.vehicle.plate_number}.` : '';
    Alert.alert(
      `Send ${plate} on ${ref}?`,
      `${withDriver ? `${niceName(withDriver.name)} drives it. ` : trip.driver ? `${niceName(`${trip.driver.first_name} ${trip.driver.last_name}`)} stays the driver. ` : ''}${replacing}`.trim() || undefined,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Assign',
          onPress: async () => {
            setSending(c.unit.key);
            try {
              await operatorService.dispatchTrip(trip.id, { vehicle_id: c.unit.vehicle!.id, ...(withDriver ? { driver_id: withDriver.id } : {}) });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              refresh();
              onAssigned(`${plate}${withDriver ? ` + ${niceName(withDriver.name)}` : ''} assigned to ${ref}`);
              onClose();
            } catch (e) {
              Alert.alert(`Couldn't assign ${plate}`, getApiErrorMessage(e));
            } finally {
              setSending(null);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={!!tripId} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.head}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Find a truck</Text>
            <Text style={s.sub} numberOfLines={2}>
              {trip ? [trip.ref_id, niceName(trip.customer?.name), pickup?.name ? `pickup ${niceName(pickup.name)}` : null].filter(Boolean).join(' · ') : 'Loading trip…'}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={8} style={s.close} accessibilityLabel="Close"><X size={16} color={MUTED} /></TouchableOpacity>
        </View>

        {tripQ.isLoading ? <ActivityIndicator style={{ marginVertical: 24 }} color={INK} /> : null}
        {tripQ.isError ? <Text style={s.empty}>Couldn&apos;t load the trip.</Text> : null}
        {trip && !canFindTruck(trip) ? (
          <Text style={s.empty}>{trip.is_third_party ? 'A 3PL partner runs this trip — they send the truck.' : 'This trip has finished; its truck can no longer change.'}</Text>
        ) : trip && !pickup ? (
          <Text style={s.empty}>The pickup has no map location yet — pin it on the trip page first.</Text>
        ) : trip ? (
          <>
            {trip.vehicle?.plate_number ? <Text style={s.note}>Now: {trip.vehicle.plate_number} — picking another truck replaces it.</Text> : null}
            <ScrollView style={{ maxHeight: 420 }}>
              {candidates.length === 0 ? <Text style={s.empty}>No free truck with a location right now.</Text> : null}
              {candidates.map((c, i) => {
                const eta = etaQ.data?.get(c.unit.key) ?? null;
                return (
                  <View key={c.unit.key} style={[s.row, i > 0 && s.rowLine]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.plate}>{c.unit.vehicle!.plate_number}</Text>
                      {c.blocker ? <Text style={s.blocker}>{c.blocker}</Text> : <Text style={s.sub} numberOfLines={1}>{c.driver ? niceName(c.driver.name) : '—'}</Text>}
                      <Text style={s.meta}>
                        {eta ? `${formatKm(eta.distanceMeters / 1000)} · ${formatDuration(eta.durationSeconds)} drive` : `${formatKm(c.km)} away`}
                        {c.notes.length ? `  ·  ${c.notes.join(' · ')}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[s.assign, (c.blocker || !!sending) && s.assignOff]}
                      onPress={() => assign(c)}
                      disabled={!!c.blocker || !!sending}
                      accessibilityLabel={`Assign ${c.unit.vehicle!.plate_number}`}
                    >
                      {sending === c.unit.key ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={s.assignText}>Assign</Text>}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 34, gap: 10 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#DCDCE0' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 18, fontWeight: '800', color: INK },
  sub: { fontSize: 13, color: MUTED },
  close: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F1F1F3', alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 12, color: MUTED },
  empty: { textAlign: 'center', color: MUTED, paddingVertical: 24, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: LINE },
  plate: { fontSize: 15, fontWeight: '700', color: INK },
  blocker: { fontSize: 12, fontWeight: '600', color: RED },
  meta: { fontSize: 12, color: '#9898A4' },
  assign: { height: 36, minWidth: 76, borderRadius: 10, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  assignOff: { backgroundColor: '#C4C4CC' },
  assignText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
