/**
 * Changing which truck a driver drives, from the truck or the driver form:
 *
 *   AssignmentImpact — "When you save": Abdullah will drive USA-6010 · KSA-6102
 *                      will have no driver · Imtiaz Ahmed will have no truck.
 *                      Asked from the server (POST /drivers/truck-assignment/preview),
 *                      worded by the shared `describeAssignment` (same as the web).
 *   TruckPicker      — bottom sheet of trucks, each saying who drives it now.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft, Check, Info } from 'lucide-react-native';
import { describeAssignment } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { ListSearch } from '@/components/ListSearch';
import { niceName } from '@/features/trips/create/components/ui';
import { operatorService, type OperatorVehicleOption } from '../../../lib/operator';

export function AssignmentImpact({ driverId, vehicleId, changed }: { driverId: string | null; vehicleId: string | null; changed: boolean }) {
  const enabled = changed && Boolean(driverId || vehicleId);
  const { data, isFetching, isError } = useQuery({
    queryKey: ['truck-assignment-preview', driverId, vehicleId],
    queryFn: () => operatorService.previewTruckAssignment({ driver_id: driverId, vehicle_id: vehicleId }),
    enabled,
    staleTime: 10_000,
  });

  if (!enabled) return null;
  if (isFetching && !data) {
    return (
      <View style={s.checking}>
        <ActivityIndicator size="small" color={Colors.gray500} />
        <Text style={s.checkingText}>Checking what this changes…</Text>
      </View>
    );
  }
  if (isError || !data || data.no_change) return null;

  const lines = describeAssignment(data);
  const knockOn = lines.some((l) => l.tone === 'knock-on');
  return (
    <View style={[s.box, knockOn ? s.boxAmber : s.boxIndigo]} accessibilityRole="summary">
      <View style={s.head}>
        <ArrowRightLeft size={13} color="#52525B" strokeWidth={2.4} />
        <Text style={s.headText}>WHEN YOU SAVE</Text>
      </View>
      {lines.map((l, i) => (
        <View key={i} style={s.line}>
          {l.tone === 'warning' ? (
            <Info size={14} color="#6B6B76" style={s.icon} />
          ) : l.tone === 'knock-on' ? (
            <AlertTriangle size={14} color="#B45309" style={s.icon} />
          ) : (
            <View style={s.dot} />
          )}
          <Text style={[s.text, l.tone === 'main' && s.textMain, l.tone === 'knock-on' && s.textAmber, l.tone === 'warning' && s.textMuted]}>
            {l.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function TruckPicker({ visible, driverId, selectedId, onPick, onClose }: {
  visible: boolean;
  /** The driver being edited — their own truck isn't "driven by someone else". */
  driverId?: string | null;
  selectedId: string | null;
  onPick: (id: string | null, truck: OperatorVehicleOption | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const trucks = useQuery({ queryKey: ['vehicles', 'lookup'], queryFn: () => operatorService.vehiclesLookup(), enabled: visible, staleTime: 60_000 });
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = trucks.data ?? [];
    return q
      ? list.filter((v) => `${v.plate_number} ${v.asset_type ?? ''} ${v.assignedDriver?.first_name ?? ''} ${v.assignedDriver?.last_name ?? ''}`.toLowerCase().includes(q))
      : list;
  }, [trucks.data, query]);

  const row = (v: OperatorVehicleOption | null) => {
    const id = v?.id ?? null;
    const holder = v?.assignedDriver && v.assignedDriver.id !== driverId ? niceName(`${v.assignedDriver.first_name} ${v.assignedDriver.last_name}`.trim()) : null;
    const sub = !v ? null : holder ? `Driven by ${holder}` : v.assignedDriver ? 'Their truck now' : 'No driver';
    return (
      <TouchableOpacity key={id ?? 'none'} style={s.pick} activeOpacity={0.7} onPress={() => onPick(id, v)} accessibilityRole="button" accessibilityState={{ selected: selectedId === id }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.pickTitle} numberOfLines={1}>{v ? `${v.plate_number}${v.asset_type ? ` · ${v.asset_type}` : ''}` : 'No truck'}</Text>
          {sub ? <Text style={[s.pickSub, holder ? { color: '#B45309' } : !v?.assignedDriver ? { color: '#15803D' } : null]} numberOfLines={1}>{sub}</Text> : null}
        </View>
        {selectedId === id ? <Check size={18} color={Colors.primary} strokeWidth={2.4} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title="Truck">
      <View style={{ gap: 10, paddingBottom: 8 }}>
        <ListSearch value={query} onChangeText={setQuery} placeholder="Search plate or driver" />
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {row(null)}
          {trucks.isLoading ? <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} /> : shown.map((v) => row(v))}
        </ScrollView>
      </View>
    </AppModal>
  );
}

const s = StyleSheet.create({
  checking: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  checkingText: { fontSize: 13, color: '#6B6B76' },
  box: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 6, marginTop: 4 },
  boxAmber: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  boxIndigo: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: '#52525B' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6366F1', marginTop: 7, marginHorizontal: 4 },
  text: { flex: 1, fontSize: 14, lineHeight: 19, color: '#3E3C3D' },
  textMain: { fontWeight: '700' },
  textAmber: { color: '#78350F', fontWeight: '600' },
  textMuted: { color: '#6B6B76' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F1F1F3' },
  pickTitle: { fontSize: 15, fontWeight: '600', color: '#3E3C3D' },
  pickSub: { fontSize: 13, color: '#6B6B76', marginTop: 1 },
});
